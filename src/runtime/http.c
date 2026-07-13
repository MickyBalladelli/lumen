#include "runtime_internal.h"
#include "lumen_http.h"
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>

#define LUMEN_HTTP_MAX_HEADERS (16 * 1024)
#define LUMEN_HTTP_MAX_BODY (1024 * 1024)
#define LUMEN_HTTP_MAX_TARGET 2048
#define LUMEN_HTTP_MAX_HEADER_COUNT 100
#define LUMEN_HTTP_MAX_CONNECTIONS 128
#define LUMEN_HTTP_IO_TIMEOUT_SECONDS 10
#define LUMEN_HTTP_SHUTDOWN_GRACE_SECONDS 5
#define LUMEN_WEBSOCKET_MAX_PAYLOAD (64 * 1024)

typedef struct {
  char headers[LUMEN_HTTP_MAX_HEADERS + 1];
  size_t headers_length;
  char method[17];
  char target[LUMEN_HTTP_MAX_TARGET + 1];
  char path[LUMEN_HTTP_MAX_TARGET + 1];
  char version[9];
  char *body;
  size_t body_length;
} LumenHttpRequest;

typedef struct {
  int fin;
  unsigned char opcode;
  size_t payload_length;
  size_t header_length;
  unsigned char mask[4];
} LumenWebSocketFrame;

typedef enum {
  LUMEN_SERVER_FILES,
  LUMEN_SERVER_API,
  LUMEN_SERVER_HTTP,
  LUMEN_SERVER_SOCKETIO
} LumenServerMode;

typedef struct {
  int listener;
  int root_fd;
  LumenServerMode mode;
  const char *api_method;
  const char *api_route;
  const char *api_headers;
  const char *api_body;
  const char **methods;
  const char **routes;
  const char **headers;
  const char **bodies;
  int route_count;
  pthread_mutex_t mutex;
  pthread_cond_t idle;
  int clients[LUMEN_HTTP_MAX_CONNECTIONS];
  int client_count;
} LumenHttpServer;

typedef struct {
  LumenHttpServer *server;
  int client;
} LumenHttpJob;

static volatile sig_atomic_t lumen_http_stop_requested = 0;
static volatile sig_atomic_t lumen_http_listener = -1;

static char socketio_messages[65536] = "";
static size_t socketio_messages_length = 0;
static pthread_mutex_t socketio_messages_mutex = PTHREAD_MUTEX_INITIALIZER;

static const unsigned char *find_bytes(
  const unsigned char *input,
  size_t length,
  const unsigned char *needle,
  size_t needle_length
) {
  if (needle_length == 0 || length < needle_length) return NULL;

  for (size_t index = 0; index <= length - needle_length; index += 1) {
    if (memcmp(input + index, needle, needle_length) == 0) return input + index;
  }

  return NULL;
}

static int ascii_equal(const char *left, size_t left_length, const char *right) {
  size_t right_length = strlen(right);
  if (left_length != right_length) return 0;

  for (size_t index = 0; index < left_length; index += 1) {
    if (tolower((unsigned char)left[index]) != tolower((unsigned char)right[index])) return 0;
  }

  return 1;
}

static int is_http_token_character(unsigned char value) {
  if (isalnum(value)) return 1;
  return strchr("!#$%&'*+-.^_`|~", value) != NULL;
}

static int parse_decimal_size(const char *value, size_t length, size_t *out) {
  if (length == 0) return 0;

  size_t result = 0;
  for (size_t index = 0; index < length; index += 1) {
    unsigned char character = (unsigned char)value[index];
    if (!isdigit(character)) return 0;
    size_t digit = (size_t)(character - '0');
    if (result > (SIZE_MAX - digit) / 10) return 0;
    result = result * 10 + digit;
  }

  *out = result;
  return 1;
}

static int decode_request_path(
  const char *target,
  size_t target_length,
  char *out,
  size_t out_size
) {
  size_t path_length = 0;
  while (path_length < target_length && target[path_length] != '?') path_length += 1;
  if (path_length == 0 || target[0] != '/' || path_length >= out_size) return 414;

  size_t offset = 0;
  for (size_t index = 0; index < path_length; index += 1) {
    unsigned char value = (unsigned char)target[index];

    if (value == '%') {
      if (index + 2 >= path_length) return 400;
      int high = isdigit((unsigned char)target[index + 1])
        ? target[index + 1] - '0'
        : tolower((unsigned char)target[index + 1]) - 'a' + 10;
      int low = isdigit((unsigned char)target[index + 2])
        ? target[index + 2] - '0'
        : tolower((unsigned char)target[index + 2]) - 'a' + 10;
      if (high < 0 || high > 15 || low < 0 || low > 15) return 400;
      value = (unsigned char)((high << 4) | low);
      index += 2;
    }

    if (value == '\0' || value == '\\' || value < 0x20 || value == 0x7f) return 400;
    out[offset++] = (char)value;
  }

  out[offset] = '\0';
  return 0;
}

static int validate_canonical_path(const char *path) {
  if (!path || path[0] != '/') return 0;
  if (path[1] == '/' || (path[1] != '\0' && path[strlen(path) - 1] == '/')) return 0;

  const char *segment = path + 1;
  while (*segment) {
    const char *end = strchr(segment, '/');
    size_t length = end ? (size_t)(end - segment) : strlen(segment);
    if (length == 0 || (length == 1 && segment[0] == '.') ||
      (length == 2 && segment[0] == '.' && segment[1] == '.')) {
      return 0;
    }
    segment = end ? end + 1 : segment + length;
  }

  return 1;
}

static int parse_http_request_head(
  const unsigned char *input,
  size_t length,
  LumenHttpRequest *request,
  size_t *content_length
) {
  if (!input || !request || length < 4 || length > LUMEN_HTTP_MAX_HEADERS) return 400;
  if (memcmp(input + length - 4, "\r\n\r\n", 4) != 0) return 400;
  if (memchr(input, '\0', length)) return 400;

  memcpy(request->headers, input, length);
  request->headers[length] = '\0';
  request->headers_length = length;

  const unsigned char *line_end = find_bytes(input, length, (const unsigned char *)"\r\n", 2);
  if (!line_end) return 400;

  size_t request_line_length = (size_t)(line_end - input);
  const unsigned char *first_space = memchr(input, ' ', request_line_length);
  if (!first_space) return 400;
  const unsigned char *second_space = memchr(
    first_space + 1,
    ' ',
    request_line_length - (size_t)(first_space + 1 - input)
  );
  if (!second_space || memchr(second_space + 1, ' ', (size_t)(line_end - second_space - 1))) return 400;

  size_t method_length = (size_t)(first_space - input);
  size_t target_length = (size_t)(second_space - first_space - 1);
  size_t version_length = (size_t)(line_end - second_space - 1);
  if (method_length == 0 || method_length >= sizeof(request->method)) return 400;
  if (target_length == 0 || target_length > LUMEN_HTTP_MAX_TARGET) return 414;
  if (version_length >= sizeof(request->version)) return 400;

  for (size_t index = 0; index < method_length; index += 1) {
    if (!is_http_token_character(input[index])) return 400;
  }
  for (size_t index = 0; index < target_length; index += 1) {
    unsigned char value = first_space[1 + index];
    if (value <= 0x20 || value == 0x7f || value == '#') return 400;
  }

  memcpy(request->method, input, method_length);
  request->method[method_length] = '\0';
  memcpy(request->target, first_space + 1, target_length);
  request->target[target_length] = '\0';
  memcpy(request->version, second_space + 1, version_length);
  request->version[version_length] = '\0';

  if (strcmp(request->version, "HTTP/1.1") != 0 && strcmp(request->version, "HTTP/1.0") != 0) return 505;

  int path_status = decode_request_path(request->target, target_length, request->path, sizeof(request->path));
  if (path_status != 0) return path_status;

  size_t offset = request_line_length + 2;
  int header_count = 0;
  int host_count = 0;
  int content_length_count = 0;
  *content_length = 0;

  while (offset + 2 <= length) {
    if (input[offset] == '\r' && input[offset + 1] == '\n') {
      offset += 2;
      break;
    }

    const unsigned char *end = find_bytes(
      input + offset,
      length - offset,
      (const unsigned char *)"\r\n",
      2
    );
    if (!end) return 400;

    size_t line_length = (size_t)(end - (input + offset));
    if (line_length == 0 || input[offset] == ' ' || input[offset] == '\t') return 400;
    const unsigned char *colon = memchr(input + offset, ':', line_length);
    if (!colon || colon == input + offset) return 400;

    size_t name_length = (size_t)(colon - (input + offset));
    for (size_t index = 0; index < name_length; index += 1) {
      if (!is_http_token_character(input[offset + index])) return 400;
    }

    const char *value = (const char *)colon + 1;
    const char *value_end = (const char *)end;
    while (value < value_end && (*value == ' ' || *value == '\t')) value += 1;
    while (value_end > value && (value_end[-1] == ' ' || value_end[-1] == '\t')) value_end -= 1;
    for (const char *cursor = value; cursor < value_end; cursor += 1) {
      unsigned char character = (unsigned char)*cursor;
      if ((character < 0x20 && character != '\t') || character == 0x7f) return 400;
    }

    size_t value_length = (size_t)(value_end - value);
    const char *name = (const char *)input + offset;
    if (ascii_equal(name, name_length, "Host")) {
      host_count += 1;
      if (value_length == 0) return 400;
    } else if (ascii_equal(name, name_length, "Content-Length")) {
      size_t parsed_length = 0;
      content_length_count += 1;
      if (content_length_count > 1 || !parse_decimal_size(value, value_length, &parsed_length)) return 400;
      if (parsed_length > LUMEN_HTTP_MAX_BODY) return 413;
      *content_length = parsed_length;
    } else if (ascii_equal(name, name_length, "Transfer-Encoding")) {
      return 501;
    } else if (ascii_equal(name, name_length, "Expect") && !ascii_equal(value, value_length, "")) {
      return 417;
    }

    header_count += 1;
    if (header_count > LUMEN_HTTP_MAX_HEADER_COUNT) return 431;
    offset = (size_t)(end - input) + 2;
  }

  if (offset != length) return 400;
  if (strcmp(request->version, "HTTP/1.1") == 0 && host_count != 1) return 400;
  if (host_count > 1) return 400;
  return 0;
}

static int request_header_value(
  const LumenHttpRequest *request,
  const char *wanted,
  char *out,
  size_t out_size
) {
  const char *cursor = strstr(request->headers, "\r\n");
  if (!cursor || out_size == 0) return 0;
  cursor += 2;

  while (cursor < request->headers + request->headers_length - 2 && strncmp(cursor, "\r\n", 2) != 0) {
    const char *end = strstr(cursor, "\r\n");
    const char *colon = end ? memchr(cursor, ':', (size_t)(end - cursor)) : NULL;
    if (!end || !colon) return 0;

    if (ascii_equal(cursor, (size_t)(colon - cursor), wanted)) {
      const char *value = colon + 1;
      while (value < end && (*value == ' ' || *value == '\t')) value += 1;
      while (end > value && (end[-1] == ' ' || end[-1] == '\t')) end -= 1;
      size_t value_length = (size_t)(end - value);
      if (value_length >= out_size) return 0;
      memcpy(out, value, value_length);
      out[value_length] = '\0';
      return 1;
    }

    cursor = end + 2;
  }

  return 0;
}

static int header_has_token(const LumenHttpRequest *request, const char *name, const char *wanted) {
  char value[512];
  if (!request_header_value(request, name, value, sizeof(value))) return 0;

  char *cursor = value;
  while (*cursor) {
    while (*cursor == ' ' || *cursor == '\t' || *cursor == ',') cursor += 1;
    char *end = cursor;
    while (*end && *end != ',') end += 1;
    char *trimmed_end = end;
    while (trimmed_end > cursor && (trimmed_end[-1] == ' ' || trimmed_end[-1] == '\t')) trimmed_end -= 1;
    if (ascii_equal(cursor, (size_t)(trimmed_end - cursor), wanted)) return 1;
    cursor = end;
  }

  return 0;
}

static int configure_client(int client, int timeout_seconds) {
  struct timeval timeout;
  timeout.tv_sec = timeout_seconds;
  timeout.tv_usec = 0;

  if (setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) != 0) return 0;
  if (setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout)) != 0) return 0;
#ifdef SO_NOSIGPIPE
  int yes = 1;
  if (setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes)) != 0) return 0;
#endif
  return 1;
}

static int read_exact(int client, void *buffer, size_t length) {
  size_t offset = 0;
  while (offset < length) {
    ssize_t count = recv(client, (unsigned char *)buffer + offset, length - offset, 0);
    if (count > 0) {
      offset += (size_t)count;
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    return 0;
  }
  return 1;
}

static int send_all(int client, const void *buffer, size_t length) {
  size_t offset = 0;
  while (offset < length) {
#ifdef MSG_NOSIGNAL
    ssize_t count = send(client, (const unsigned char *)buffer + offset, length - offset, MSG_NOSIGNAL);
#else
    ssize_t count = send(client, (const unsigned char *)buffer + offset, length - offset, 0);
#endif
    if (count > 0) {
      offset += (size_t)count;
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    return 0;
  }
  return 1;
}

static int read_http_request(int client, LumenHttpRequest *request) {
  memset(request, 0, sizeof(*request));
  const unsigned char delimiter[] = "\r\n\r\n";
  unsigned char incoming[LUMEN_HTTP_MAX_HEADERS + 1];
  size_t received = 0;
  size_t header_length = 0;

  while (received < LUMEN_HTTP_MAX_HEADERS) {
    ssize_t count = recv(client, incoming + received, LUMEN_HTTP_MAX_HEADERS - received, 0);
    if (count > 0) {
      received += (size_t)count;
      const unsigned char *end = find_bytes(
        incoming,
        received,
        delimiter,
        sizeof(delimiter) - 1
      );
      if (end) {
        header_length = (size_t)(end - incoming) + 4;
        break;
      }
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    if (count < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return 408;
    return 400;
  }

  if (header_length == 0) return 431;

  size_t content_length = 0;
  int status = parse_http_request_head(
    incoming,
    header_length,
    request,
    &content_length
  );
  if (status != 0) return status;

  size_t body_received = received - header_length;
  if (body_received > content_length) return 400;

  request->body = malloc(content_length + 1);
  if (!request->body) return 500;
  if (body_received > 0) memcpy(request->body, incoming + header_length, body_received);
  if (!read_exact(client, request->body + body_received, content_length - body_received)) {
    free(request->body);
    request->body = NULL;
    return errno == EAGAIN || errno == EWOULDBLOCK ? 408 : 400;
  }

  request->body[content_length] = '\0';
  request->body_length = content_length;
  return 0;
}

static const char *status_text(int status) {
  switch (status) {
    case 101: return "Switching Protocols";
    case 200: return "OK";
    case 204: return "No Content";
    case 400: return "Bad Request";
    case 404: return "Not Found";
    case 405: return "Method Not Allowed";
    case 408: return "Request Timeout";
    case 413: return "Payload Too Large";
    case 414: return "URI Too Long";
    case 417: return "Expectation Failed";
    case 426: return "Upgrade Required";
    case 431: return "Request Header Fields Too Large";
    case 500: return "Internal Server Error";
    case 501: return "Not Implemented";
    case 503: return "Service Unavailable";
    case 505: return "HTTP Version Not Supported";
    default: return "Error";
  }
}

static int normalize_response_headers(const char *headers, char *out, size_t out_size) {
  size_t offset = 0;
  const char *cursor = headers ? headers : "";

  while (*cursor) {
    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);
    const char *line_end = end;
    if (line_end > cursor && line_end[-1] == '\r') line_end -= 1;
    if (line_end == cursor) {
      cursor = *end ? end + 1 : end;
      continue;
    }

    const char *colon = memchr(cursor, ':', (size_t)(line_end - cursor));
    if (!colon || colon == cursor) return 0;
    size_t name_length = (size_t)(colon - cursor);
    for (size_t index = 0; index < name_length; index += 1) {
      if (!is_http_token_character((unsigned char)cursor[index])) return 0;
    }
    if (ascii_equal(cursor, name_length, "Content-Length") ||
      ascii_equal(cursor, name_length, "Connection") ||
      ascii_equal(cursor, name_length, "Transfer-Encoding")) {
      return 0;
    }

    const char *value = colon + 1;
    while (value < line_end && (*value == ' ' || *value == '\t')) value += 1;
    for (const char *item = value; item < line_end; item += 1) {
      unsigned char character = (unsigned char)*item;
      if ((character < 0x20 && character != '\t') || character == 0x7f) return 0;
    }

    size_t needed = name_length + 2 + (size_t)(line_end - value) + 2;
    if (offset + needed >= out_size) return 0;
    memcpy(out + offset, cursor, name_length);
    offset += name_length;
    out[offset++] = ':';
    out[offset++] = ' ';
    memcpy(out + offset, value, (size_t)(line_end - value));
    offset += (size_t)(line_end - value);
    out[offset++] = '\r';
    out[offset++] = '\n';
    cursor = *end ? end + 1 : end;
  }

  out[offset] = '\0';
  return 1;
}

static int write_response_with_headers(
  int client,
  int status,
  const char *headers,
  const void *body,
  size_t length,
  int head_only
) {
  char normalized[8192];
  if (!normalize_response_headers(headers, normalized, sizeof(normalized))) {
    status = 500;
    normalized[0] = '\0';
    body = "internal server error\n";
    length = strlen((const char *)body);
  }

  char header[9216];
  int header_length = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\n%sContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    status_text(status),
    normalized,
    length
  );
  if (header_length < 0 || (size_t)header_length >= sizeof(header)) return 0;
  if (!send_all(client, header, (size_t)header_length)) return 0;
  return head_only || length == 0 || send_all(client, body, length);
}

static int write_response(
  int client,
  int status,
  const char *type,
  const void *body,
  size_t length,
  int head_only
) {
  char headers[256];
  int count = snprintf(headers, sizeof(headers), "Content-Type: %s\r\n", type);
  if (count < 0 || (size_t)count >= sizeof(headers)) return 0;
  return write_response_with_headers(client, status, headers, body, length, head_only);
}

static void write_error_response(int client, int status) {
  char body[128];
  int length = snprintf(body, sizeof(body), "%d %s\n", status, status_text(status));
  if (length > 0) write_response(client, status, "text/plain; charset=utf-8", body, (size_t)length, 0);
}

static const char *content_type(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) return "application/octet-stream";
  if (strcmp(dot, ".html") == 0) return "text/html; charset=utf-8";
  if (strcmp(dot, ".css") == 0) return "text/css; charset=utf-8";
  if (strcmp(dot, ".js") == 0) return "text/javascript; charset=utf-8";
  if (strcmp(dot, ".json") == 0) return "application/json";
  if (strcmp(dot, ".svg") == 0) return "image/svg+xml";
  if (strcmp(dot, ".png") == 0) return "image/png";
  if (strcmp(dot, ".jpg") == 0 || strcmp(dot, ".jpeg") == 0) return "image/jpeg";
  if (strcmp(dot, ".ico") == 0) return "image/x-icon";
  if (strcmp(dot, ".wasm") == 0) return "application/wasm";
  return "application/octet-stream";
}

static int open_static_file(int root_fd, const char *request_path, char *resolved, size_t resolved_size) {
  const char *path = strcmp(request_path, "/") == 0 ? "/index.html" : request_path;
  if (!validate_canonical_path(path)) return -1;
  if (strlen(path) >= resolved_size) return -1;
  snprintf(resolved, resolved_size, "%s", path);

  char working[LUMEN_HTTP_MAX_TARGET + 1];
  snprintf(working, sizeof(working), "%s", path + 1);
  int directory = dup(root_fd);
  if (directory < 0) return -1;

  char *save = NULL;
  char *segment = strtok_r(working, "/", &save);
  while (segment) {
    char *next = strtok_r(NULL, "/", &save);
    int flags = O_RDONLY;
#ifdef O_CLOEXEC
    flags |= O_CLOEXEC;
#endif
#ifdef O_NOFOLLOW
    flags |= O_NOFOLLOW;
#endif
    if (next) flags |= O_DIRECTORY;

    int opened = openat(directory, segment, flags);
    close(directory);
    if (opened < 0) return -1;
    directory = opened;
    segment = next;
  }

  struct stat info;
  if (fstat(directory, &info) != 0 || !S_ISREG(info.st_mode)) {
    close(directory);
    return -1;
  }
  return directory;
}

static int serve_static_file(int client, int root_fd, const char *path, int head_only) {
  char resolved[LUMEN_HTTP_MAX_TARGET + 1];
  int file = open_static_file(root_fd, path, resolved, sizeof(resolved));
  if (file < 0) return 0;

  struct stat info;
  if (fstat(file, &info) != 0 || info.st_size < 0) {
    close(file);
    return 0;
  }

  char headers[256];
  int headers_length = snprintf(
    headers,
    sizeof(headers),
    "Content-Type: %s\r\n",
    content_type(resolved)
  );
  if (headers_length < 0 || (size_t)headers_length >= sizeof(headers)) {
    close(file);
    return 0;
  }

  char normalized[512];
  normalize_response_headers(headers, normalized, sizeof(normalized));
  char response[1024];
  int response_length = snprintf(
    response,
    sizeof(response),
    "HTTP/1.1 200 OK\r\n%sContent-Length: %llu\r\nConnection: close\r\n\r\n",
    normalized,
    (unsigned long long)info.st_size
  );
  if (response_length < 0 || (size_t)response_length >= sizeof(response) ||
    !send_all(client, response, (size_t)response_length)) {
    close(file);
    return 1;
  }

  if (!head_only) {
    unsigned char chunk[16384];
    for (;;) {
      ssize_t count = read(file, chunk, sizeof(chunk));
      if (count > 0) {
        if (!send_all(client, chunk, (size_t)count)) break;
        continue;
      }
      if (count < 0 && errno == EINTR) continue;
      break;
    }
  }

  close(file);
  return 1;
}

static int json_skip_space(const unsigned char *input, size_t length, size_t *offset) {
  while (*offset < length) {
    unsigned char value = input[*offset];
    if (value != ' ' && value != '\t' && value != '\r' && value != '\n') break;
    *offset += 1;
  }
  return *offset < length;
}

static int json_parse_value(const unsigned char *input, size_t length, size_t *offset, int depth);
static int valid_utf8(const unsigned char *input, size_t length);

static int json_parse_string(const unsigned char *input, size_t length, size_t *offset) {
  if (*offset >= length || input[*offset] != '"') return 0;
  *offset += 1;

  while (*offset < length) {
    unsigned char value = input[(*offset)++];
    if (value == '"') return 1;
    if (value < 0x20) return 0;
    if (value != '\\') continue;
    if (*offset >= length) return 0;
    value = input[(*offset)++];
    if (value == '"' || value == '\\' || value == '/' || value == 'b' ||
      value == 'f' || value == 'n' || value == 'r' || value == 't') continue;
    if (value != 'u' || *offset + 4 > length) return 0;
    for (int index = 0; index < 4; index += 1) {
      if (!isxdigit(input[*offset + (size_t)index])) return 0;
    }
    *offset += 4;
  }

  return 0;
}

static int json_parse_number(const unsigned char *input, size_t length, size_t *offset) {
  size_t cursor = *offset;
  if (cursor < length && input[cursor] == '-') cursor += 1;
  if (cursor >= length) return 0;

  if (input[cursor] == '0') {
    cursor += 1;
  } else {
    if (input[cursor] < '1' || input[cursor] > '9') return 0;
    while (cursor < length && isdigit(input[cursor])) cursor += 1;
  }

  if (cursor < length && input[cursor] == '.') {
    cursor += 1;
    if (cursor >= length || !isdigit(input[cursor])) return 0;
    while (cursor < length && isdigit(input[cursor])) cursor += 1;
  }

  if (cursor < length && (input[cursor] == 'e' || input[cursor] == 'E')) {
    cursor += 1;
    if (cursor < length && (input[cursor] == '+' || input[cursor] == '-')) cursor += 1;
    if (cursor >= length || !isdigit(input[cursor])) return 0;
    while (cursor < length && isdigit(input[cursor])) cursor += 1;
  }

  *offset = cursor;
  return 1;
}

static int json_parse_value(const unsigned char *input, size_t length, size_t *offset, int depth) {
  if (depth > 64 || !json_skip_space(input, length, offset)) return 0;

  unsigned char value = input[*offset];
  if (value == '"') return json_parse_string(input, length, offset);
  if (value == '-' || isdigit(value)) return json_parse_number(input, length, offset);

  if (value == '{' || value == '[') {
    unsigned char close = value == '{' ? '}' : ']';
    int object = value == '{';
    *offset += 1;
    json_skip_space(input, length, offset);
    if (*offset < length && input[*offset] == close) {
      *offset += 1;
      return 1;
    }

    for (;;) {
      if (object) {
        if (!json_parse_string(input, length, offset)) return 0;
        json_skip_space(input, length, offset);
        if (*offset >= length || input[*offset] != ':') return 0;
        *offset += 1;
      }
      if (!json_parse_value(input, length, offset, depth + 1)) return 0;
      json_skip_space(input, length, offset);
      if (*offset >= length) return 0;
      if (input[*offset] == close) {
        *offset += 1;
        return 1;
      }
      if (input[*offset] != ',') return 0;
      *offset += 1;
      json_skip_space(input, length, offset);
    }
  }

  const char *literal = value == 't' ? "true" : value == 'f' ? "false" : value == 'n' ? "null" : NULL;
  if (!literal) return 0;
  size_t literal_length = strlen(literal);
  if (*offset + literal_length > length ||
    memcmp(input + *offset, literal, literal_length) != 0) return 0;
  *offset += literal_length;
  return 1;
}

static int is_json_value(const unsigned char *input, size_t length, int require_object) {
  if (!input || length == 0 || (require_object && input[0] != '{')) return 0;
  size_t offset = 0;
  if (!json_parse_value(input, length, &offset, 0)) return 0;
  json_skip_space(input, length, &offset);
  return offset == length;
}

static int socketio_append_message(const unsigned char *message, size_t length) {
  if (length == 0 || !valid_utf8(message, length) || !is_json_value(message, length, 1)) return 0;

  pthread_mutex_lock(&socketio_messages_mutex);
  size_t separator = socketio_messages_length > 0 ? 1 : 0;
  if (socketio_messages_length + separator + length >= sizeof(socketio_messages)) {
    pthread_mutex_unlock(&socketio_messages_mutex);
    return 0;
  }

  if (separator) socketio_messages[socketio_messages_length++] = ',';
  memcpy(socketio_messages + socketio_messages_length, message, length);
  socketio_messages_length += length;
  socketio_messages[socketio_messages_length] = '\0';
  pthread_mutex_unlock(&socketio_messages_mutex);
  return 1;
}

static char *socketio_messages_json(void) {
  pthread_mutex_lock(&socketio_messages_mutex);
  char *out = malloc(socketio_messages_length + 3);
  if (out) {
    out[0] = '[';
    memcpy(out + 1, socketio_messages, socketio_messages_length);
    out[socketio_messages_length + 1] = ']';
    out[socketio_messages_length + 2] = '\0';
  }
  pthread_mutex_unlock(&socketio_messages_mutex);
  return out ? out : lumen_strdup("[]");
}

static void base64_encode(const unsigned char *input, size_t length, char *out, size_t out_size) {
  static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t offset = 0;

  for (size_t index = 0; index < length && offset + 4 < out_size; index += 3) {
    unsigned int value = (unsigned int)input[index] << 16;
    if (index + 1 < length) value |= (unsigned int)input[index + 1] << 8;
    if (index + 2 < length) value |= input[index + 2];
    out[offset++] = table[(value >> 18) & 63];
    out[offset++] = table[(value >> 12) & 63];
    out[offset++] = index + 1 < length ? table[(value >> 6) & 63] : '=';
    out[offset++] = index + 2 < length ? table[value & 63] : '=';
  }
  out[offset] = '\0';
}

static int valid_websocket_key(const char *key) {
  if (strlen(key) != 24 || key[22] != '=' || key[23] != '=') return 0;
  for (size_t index = 0; index < 22; index += 1) {
    unsigned char value = (unsigned char)key[index];
    if (!isalnum(value) && value != '+' && value != '/') return 0;
  }
  return key[21] == 'A' || key[21] == 'Q' || key[21] == 'g' || key[21] == 'w';
}

static uint32_t rotate_left(uint32_t value, unsigned int count) {
  return (value << count) | (value >> (32 - count));
}

static void portable_sha1(const unsigned char *input, size_t length, unsigned char digest[20]) {
  uint32_t state[5] = {
    0x67452301,
    0xefcdab89,
    0x98badcfe,
    0x10325476,
    0xc3d2e1f0
  };
  size_t padded_length = length + 1;
  while (padded_length % 64 != 56) padded_length += 1;
  size_t total_length = padded_length + 8;
  unsigned char *message = malloc(total_length);
  if (!message) {
    memset(digest, 0, 20);
    return;
  }

  memset(message, 0, total_length);
  memcpy(message, input, length);
  message[length] = 0x80;
  uint64_t bit_length = (uint64_t)length * 8;
  for (size_t index = 0; index < 8; index += 1) {
    message[total_length - 1 - index] = (unsigned char)(bit_length >> (index * 8));
  }

  for (size_t block = 0; block < total_length; block += 64) {
    uint32_t words[80];
    for (size_t index = 0; index < 16; index += 1) {
      size_t offset = block + index * 4;
      words[index] =
        ((uint32_t)message[offset] << 24) |
        ((uint32_t)message[offset + 1] << 16) |
        ((uint32_t)message[offset + 2] << 8) |
        message[offset + 3];
    }
    for (size_t index = 16; index < 80; index += 1) {
      words[index] = rotate_left(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1
      );
    }

    uint32_t a = state[0];
    uint32_t b = state[1];
    uint32_t c = state[2];
    uint32_t d = state[3];
    uint32_t e = state[4];

    for (size_t index = 0; index < 80; index += 1) {
      uint32_t function;
      uint32_t constant;
      if (index < 20) {
        function = (b & c) | ((~b) & d);
        constant = 0x5a827999;
      } else if (index < 40) {
        function = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (index < 60) {
        function = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        function = b ^ c ^ d;
        constant = 0xca62c1d6;
      }

      uint32_t temporary = rotate_left(a, 5) + function + e + constant + words[index];
      e = d;
      d = c;
      c = rotate_left(b, 30);
      b = a;
      a = temporary;
    }

    state[0] += a;
    state[1] += b;
    state[2] += c;
    state[3] += d;
    state[4] += e;
  }

  free(message);
  for (size_t index = 0; index < 5; index += 1) {
    digest[index * 4] = (unsigned char)(state[index] >> 24);
    digest[index * 4 + 1] = (unsigned char)(state[index] >> 16);
    digest[index * 4 + 2] = (unsigned char)(state[index] >> 8);
    digest[index * 4 + 3] = (unsigned char)state[index];
  }
}

static int websocket_accept_key(const char *client_key, char *out, size_t out_size) {
  if (!valid_websocket_key(client_key)) return 0;
  const char *guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  char combined[128];
  unsigned char digest[20];
  int length = snprintf(combined, sizeof(combined), "%s%s", client_key, guid);
  if (length < 0 || (size_t)length >= sizeof(combined)) return 0;
  portable_sha1((const unsigned char *)combined, (size_t)length, digest);
  base64_encode(digest, sizeof(digest), out, out_size);
  return 1;
}

static int parse_websocket_frame_header(
  const unsigned char *input,
  size_t length,
  LumenWebSocketFrame *frame
) {
  if (!input || !frame || length < 2) return 0;
  if ((input[0] & 0x70) != 0 || (input[0] & 0x80) == 0 || (input[1] & 0x80) == 0) return -1;

  frame->fin = 1;
  frame->opcode = input[0] & 0x0f;
  if (frame->opcode != 1 && frame->opcode != 8 && frame->opcode != 9 && frame->opcode != 10) return -1;

  uint64_t payload_length = input[1] & 0x7f;
  size_t offset = 2;
  if (payload_length == 126) {
    if (length < 4) return 0;
    payload_length = ((uint64_t)input[2] << 8) | input[3];
    if (payload_length < 126) return -1;
    offset = 4;
  } else if (payload_length == 127) {
    if (length < 10) return 0;
    if (input[2] & 0x80) return -1;
    payload_length = 0;
    for (size_t index = 2; index < 10; index += 1) {
      payload_length = (payload_length << 8) | input[index];
    }
    if (payload_length < 65536) return -1;
    offset = 10;
  }

  if ((frame->opcode & 0x08) && payload_length > 125) return -1;
  if (payload_length > LUMEN_WEBSOCKET_MAX_PAYLOAD) return -2;
  if (length < offset + 4) return 0;

  frame->payload_length = (size_t)payload_length;
  frame->header_length = offset + 4;
  memcpy(frame->mask, input + offset, 4);
  return 1;
}

static int valid_utf8(const unsigned char *input, size_t length) {
  size_t index = 0;
  while (index < length) {
    unsigned char first = input[index++];
    if (first <= 0x7f) continue;

    int continuation = 0;
    uint32_t value = 0;
    uint32_t minimum = 0;
    if ((first & 0xe0) == 0xc0) {
      continuation = 1;
      value = first & 0x1f;
      minimum = 0x80;
    } else if ((first & 0xf0) == 0xe0) {
      continuation = 2;
      value = first & 0x0f;
      minimum = 0x800;
    } else if ((first & 0xf8) == 0xf0) {
      continuation = 3;
      value = first & 0x07;
      minimum = 0x10000;
    } else {
      return 0;
    }

    if (index + (size_t)continuation > length) return 0;
    for (int item = 0; item < continuation; item += 1) {
      unsigned char next = input[index++];
      if ((next & 0xc0) != 0x80) return 0;
      value = (value << 6) | (next & 0x3f);
    }
    if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return 0;
  }
  return 1;
}

static int websocket_send_frame(int client, unsigned char opcode, const void *payload, size_t length) {
  unsigned char header[10];
  size_t header_length = 2;
  header[0] = 0x80 | opcode;
  if (length < 126) {
    header[1] = (unsigned char)length;
  } else if (length <= 65535) {
    header[1] = 126;
    header[2] = (unsigned char)(length >> 8);
    header[3] = (unsigned char)length;
    header_length = 4;
  } else {
    header[1] = 127;
    for (size_t index = 0; index < 8; index += 1) {
      header[2 + index] = (unsigned char)((uint64_t)length >> (56 - index * 8));
    }
    header_length = 10;
  }
  return send_all(client, header, header_length) && send_all(client, payload, length);
}

static void websocket_close(int client, unsigned short code) {
  unsigned char payload[2] = {
    (unsigned char)(code >> 8),
    (unsigned char)(code & 255)
  };
  websocket_send_frame(client, 8, payload, sizeof(payload));
}

static int valid_websocket_close_code(unsigned short code) {
  if (code >= 3000 && code <= 4999) return 1;
  if (code < 1000 || code > 1014) return 0;
  return code != 1004 && code != 1005 && code != 1006;
}

static int websocket_read_frame(int client, LumenWebSocketFrame *frame, unsigned char **payload) {
  unsigned char header[14];
  if (!read_exact(client, header, 2)) return 0;

  size_t extra = (header[1] & 0x7f) == 126 ? 2 : (header[1] & 0x7f) == 127 ? 8 : 0;
  if (!read_exact(client, header + 2, extra + 4)) return 0;

  int parsed = parse_websocket_frame_header(header, 2 + extra + 4, frame);
  if (parsed != 1) return parsed;

  *payload = malloc(frame->payload_length + 1);
  if (!*payload) return -2;
  if (!read_exact(client, *payload, frame->payload_length)) {
    free(*payload);
    *payload = NULL;
    return 0;
  }
  for (size_t index = 0; index < frame->payload_length; index += 1) {
    (*payload)[index] ^= frame->mask[index % 4];
  }
  (*payload)[frame->payload_length] = '\0';
  return 1;
}

static void websocket_chat_loop(int client) {
  configure_client(client, 60);

  for (;;) {
    LumenWebSocketFrame frame;
    unsigned char *payload = NULL;
    int result = websocket_read_frame(client, &frame, &payload);
    if (result == -2) {
      websocket_close(client, 1009);
      break;
    }
    if (result != 1) {
      if (result < 0) websocket_close(client, 1002);
      break;
    }

    if (frame.opcode == 8) {
      unsigned short close_code = frame.payload_length >= 2
        ? (unsigned short)(((unsigned short)payload[0] << 8) | payload[1])
        : 1000;
      if (frame.payload_length == 1 ||
        (frame.payload_length >= 2 && !valid_websocket_close_code(close_code)) ||
        (frame.payload_length > 2 && !valid_utf8(payload + 2, frame.payload_length - 2))) {
        free(payload);
        websocket_close(client, 1002);
        break;
      }
      websocket_send_frame(client, 8, payload, frame.payload_length);
      free(payload);
      break;
    }
    if (frame.opcode == 9) {
      websocket_send_frame(client, 10, payload, frame.payload_length);
      free(payload);
      continue;
    }
    if (frame.opcode == 10) {
      free(payload);
      continue;
    }
    if (!valid_utf8(payload, frame.payload_length) ||
      !socketio_append_message(payload, frame.payload_length)) {
      free(payload);
      websocket_close(client, 1007);
      break;
    }

    free(payload);
    char *body = socketio_messages_json();
    websocket_send_frame(client, 1, body, strlen(body));
    free(body);
  }
}

static int websocket_handshake(int client, const LumenHttpRequest *request) {
  char key[128];
  char version[32];
  char accept_key[128];

  if (strcmp(request->method, "GET") != 0 ||
    strcmp(request->version, "HTTP/1.1") != 0 ||
    !header_has_token(request, "Upgrade", "websocket") ||
    !header_has_token(request, "Connection", "upgrade") ||
    !request_header_value(request, "Sec-WebSocket-Version", version, sizeof(version)) ||
    strcmp(version, "13") != 0 ||
    !request_header_value(request, "Sec-WebSocket-Key", key, sizeof(key)) ||
    !websocket_accept_key(key, accept_key, sizeof(accept_key))) {
    return 0;
  }

  char response[512];
  int length = snprintf(
    response,
    sizeof(response),
    "HTTP/1.1 101 Switching Protocols\r\n"
    "Upgrade: websocket\r\n"
    "Connection: Upgrade\r\n"
    "Sec-WebSocket-Accept: %s\r\n\r\n",
    accept_key
  );
  return length > 0 && (size_t)length < sizeof(response) && send_all(client, response, (size_t)length);
}

static int make_server(int port) {
  if (port < 1 || port > 65535) return -1;
  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return -1;

  int yes = 1;
  if (setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes)) != 0) {
    close(server);
    return -1;
  }

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_ANY);
  address.sin_port = htons((uint16_t)port);

  if (bind(server, (struct sockaddr *)&address, sizeof(address)) < 0 ||
    listen(server, LUMEN_HTTP_MAX_CONNECTIONS) < 0) {
    close(server);
    return -1;
  }
  return server;
}

static int open_root(const char *root) {
  if (!root || !*root) return -1;
  char canonical[PATH_MAX];
  if (!realpath(root, canonical)) return -1;
  int flags = O_RDONLY | O_DIRECTORY;
#ifdef O_CLOEXEC
  flags |= O_CLOEXEC;
#endif
  return open(canonical, flags);
}

static void handle_socketio(int client, LumenHttpServer *server, const LumenHttpRequest *request) {
  const char *json_headers =
    "Content-Type: application/json\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Headers: content-type\r\n"
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";
  const char *text_headers =
    "Content-Type: text/plain; charset=utf-8\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Headers: content-type\r\n"
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";

  if (strcmp(request->method, "OPTIONS") == 0) {
    write_response_with_headers(client, 204, json_headers, "", 0, 0);
  } else if (strcmp(request->method, "GET") == 0 &&
    (strcmp(request->path, "/socket.io") == 0 || strcmp(request->path, "/socket.io/") == 0)) {
    const char *body =
      "0{\"sid\":\"lumen\",\"upgrades\":[],\"pingInterval\":25000,"
      "\"pingTimeout\":20000,\"maxPayload\":1048576}";
    write_response_with_headers(client, 200, text_headers, body, strlen(body), 0);
  } else if (strcmp(request->path, "/socket.io/ws") == 0) {
    if (!websocket_handshake(client, request)) {
      const char *upgrade_headers = "Sec-WebSocket-Version: 13\r\n";
      const char *body = "websocket upgrade required\n";
      write_response_with_headers(client, 426, upgrade_headers, body, strlen(body), 0);
    } else {
      websocket_chat_loop(client);
    }
  } else if (strcmp(request->method, "GET") == 0 &&
    strcmp(request->path, "/socket.io/messages") == 0) {
    char *body = socketio_messages_json();
    write_response_with_headers(client, 200, json_headers, body, strlen(body), 0);
    free(body);
  } else if (strcmp(request->method, "POST") == 0 &&
    strcmp(request->path, "/socket.io/emit") == 0) {
    if (!socketio_append_message((const unsigned char *)request->body, request->body_length)) {
      const char *body = "{\"ok\":false,\"error\":\"invalid or full payload\"}";
      write_response_with_headers(client, 400, json_headers, body, strlen(body), 0);
    } else {
      const char *body = "{\"ok\":true}";
      write_response_with_headers(client, 200, json_headers, body, strlen(body), 0);
    }
  } else if ((strcmp(request->method, "GET") == 0 || strcmp(request->method, "HEAD") == 0) &&
    serve_static_file(client, server->root_fd, request->path, strcmp(request->method, "HEAD") == 0)) {
    return;
  } else {
    write_error_response(client, 404);
  }
}

static void handle_request(int client, LumenHttpServer *server, const LumenHttpRequest *request) {
  if (server->mode == LUMEN_SERVER_SOCKETIO) {
    handle_socketio(client, server, request);
    return;
  }

  if (server->mode == LUMEN_SERVER_API) {
    if (strcmp(request->method, server->api_method) == 0 &&
      strcmp(request->path, server->api_route) == 0) {
      write_response_with_headers(
        client,
        200,
        server->api_headers,
        server->api_body,
        strlen(server->api_body),
        strcmp(request->method, "HEAD") == 0
      );
    } else {
      write_error_response(client, 404);
    }
    return;
  }

  if (server->mode == LUMEN_SERVER_HTTP) {
    for (int index = 0; index < server->route_count; index += 1) {
      if (strcmp(request->method, server->methods[index]) == 0 &&
        strcmp(request->path, server->routes[index]) == 0) {
        write_response_with_headers(
          client,
          200,
          server->headers[index],
          server->bodies[index],
          strlen(server->bodies[index]),
          strcmp(request->method, "HEAD") == 0
        );
        return;
      }
    }
  }

  if (strcmp(request->method, "GET") != 0 && strcmp(request->method, "HEAD") != 0) {
    const char *headers = "Allow: GET, HEAD\r\nContent-Type: text/plain; charset=utf-8\r\n";
    const char *body = "405 Method Not Allowed\n";
    write_response_with_headers(client, 405, headers, body, strlen(body), 0);
    return;
  }

  if (!serve_static_file(client, server->root_fd, request->path, strcmp(request->method, "HEAD") == 0)) {
    write_error_response(client, 404);
  }
}

static void server_remove_client(LumenHttpServer *server, int client) {
  pthread_mutex_lock(&server->mutex);
  for (int index = 0; index < server->client_count; index += 1) {
    if (server->clients[index] == client) {
      server->clients[index] = server->clients[server->client_count - 1];
      server->client_count -= 1;
      break;
    }
  }
  if (server->client_count == 0) pthread_cond_signal(&server->idle);
  pthread_mutex_unlock(&server->mutex);
}

static void *http_worker(void *raw_job) {
  LumenHttpJob *job = raw_job;
  LumenHttpServer *server = job->server;
  int client = job->client;
  free(job);

  LumenHttpRequest request;
  int status = configure_client(client, LUMEN_HTTP_IO_TIMEOUT_SECONDS)
    ? read_http_request(client, &request)
    : 500;
  if (status == 0) {
    handle_request(client, server, &request);
    free(request.body);
  } else {
    write_error_response(client, status);
  }

  shutdown(client, SHUT_RDWR);
  server_remove_client(server, client);
  close(client);
  return NULL;
}

static void http_stop_handler(int signal_number) {
  (void)signal_number;
  lumen_http_stop_requested = 1;
  int listener = (int)lumen_http_listener;
  lumen_http_listener = -1;
  if (listener >= 0) close(listener);
}

static int run_server(LumenHttpServer *server, int port, const char *label) {
  server->listener = make_server(port);
  if (server->listener < 0) return 1;

  pthread_mutex_init(&server->mutex, NULL);
  pthread_cond_init(&server->idle, NULL);
  server->client_count = 0;
  lumen_http_stop_requested = 0;
  lumen_http_listener = server->listener;

  struct sigaction action;
  struct sigaction old_int;
  struct sigaction old_term;
  struct sigaction old_pipe;
  memset(&action, 0, sizeof(action));
  action.sa_handler = http_stop_handler;
  sigemptyset(&action.sa_mask);
  sigaction(SIGINT, &action, &old_int);
  sigaction(SIGTERM, &action, &old_term);
  action.sa_handler = SIG_IGN;
  sigaction(SIGPIPE, &action, &old_pipe);

  if (label) {
    printf("%s http://localhost:%d\n", label, port);
    fflush(stdout);
  }

  while (!lumen_http_stop_requested) {
    int client = accept(server->listener, NULL, NULL);
    if (client < 0) {
      if (errno == EINTR) continue;
      if (lumen_http_stop_requested || errno == EBADF || errno == EINVAL) break;
      continue;
    }

    pthread_mutex_lock(&server->mutex);
    if (server->client_count >= LUMEN_HTTP_MAX_CONNECTIONS) {
      pthread_mutex_unlock(&server->mutex);
      configure_client(client, LUMEN_HTTP_IO_TIMEOUT_SECONDS);
      write_error_response(client, 503);
      close(client);
      continue;
    }
    server->clients[server->client_count++] = client;
    pthread_mutex_unlock(&server->mutex);

    LumenHttpJob *job = malloc(sizeof(LumenHttpJob));
    pthread_t thread;
    pthread_attr_t attributes;
    if (!job) {
      write_error_response(client, 503);
      server_remove_client(server, client);
      close(client);
      continue;
    }
    job->server = server;
    job->client = client;

    int attributes_ready = pthread_attr_init(&attributes) == 0;
    int created_detached = 0;
    if (attributes_ready) {
      created_detached =
        pthread_attr_setdetachstate(&attributes, PTHREAD_CREATE_DETACHED) == 0;
      pthread_attr_setstacksize(&attributes, 256 * 1024);
    }
    int create_status = pthread_create(
      &thread,
      attributes_ready ? &attributes : NULL,
      http_worker,
      job
    );
    if (attributes_ready) pthread_attr_destroy(&attributes);

    if (create_status != 0) {
      free(job);
      write_error_response(client, 503);
      server_remove_client(server, client);
      close(client);
      continue;
    }
    if (!created_detached) pthread_detach(thread);
  }

  if (lumen_http_listener == server->listener) {
    lumen_http_listener = -1;
    close(server->listener);
  }
  server->listener = -1;

  pthread_mutex_lock(&server->mutex);
  struct timespec drain_deadline;
  clock_gettime(CLOCK_REALTIME, &drain_deadline);
  drain_deadline.tv_sec += LUMEN_HTTP_SHUTDOWN_GRACE_SECONDS;

  int drain_status = 0;
  while (server->client_count > 0 && drain_status == 0) {
    drain_status = pthread_cond_timedwait(&server->idle, &server->mutex, &drain_deadline);
  }

  if (server->client_count > 0) {
    for (int index = 0; index < server->client_count; index += 1) {
      shutdown(server->clients[index], SHUT_RDWR);
    }
  }
  while (server->client_count > 0) pthread_cond_wait(&server->idle, &server->mutex);
  pthread_mutex_unlock(&server->mutex);

  sigaction(SIGINT, &old_int, NULL);
  sigaction(SIGTERM, &old_term, NULL);
  sigaction(SIGPIPE, &old_pipe, NULL);
  pthread_cond_destroy(&server->idle);
  pthread_mutex_destroy(&server->mutex);
  return 0;
}

static char *lumen_socketio_event_value(const char *event, const char *payload) {
  size_t length = strlen(event) + strlen(payload) + 8;
  char *out = malloc(length);
  if (!out) return NULL;
  snprintf(out, length, "[\"%s\",%s]", event, payload);
  return out;
}

static char *lumen_socketio_emit_value(const char *room, const char *event, const char *payload) {
  size_t length = strlen(room) + strlen(event) + strlen(payload) + 40;
  char *out = malloc(length);
  if (!out) return NULL;
  snprintf(out, length, "{\"room\":\"%s\",\"event\":\"%s\",\"payload\":%s}", room, event, payload);
  return out;
}

static char *lumen_http_request_value(const char *method, const char *path, const char *body) {
  size_t length = strlen(method) + strlen(path) + strlen(body) + 48;
  char *out = malloc(length);
  if (!out) return NULL;
  snprintf(out, length, "{\"method\":\"%s\",\"path\":\"%s\",\"body\":%s}", method, path, body);
  return out;
}

static char *lumen_http_response_value(int status, const char *headers, const char *body) {
  size_t length = strlen(headers) + strlen(body) + 48;
  char *out = malloc(length);
  if (!out) return NULL;
  snprintf(out, length, "{\"status\":%d,\"headers\":%s,\"body\":%s}", status, headers, body);
  return out;
}

static int lumen_socketio_serve_chat_value(int port, const char *root) {
  LumenHttpServer server;
  memset(&server, 0, sizeof(server));
  server.mode = LUMEN_SERVER_SOCKETIO;
  server.root_fd = open_root(root);
  if (server.root_fd < 0) return 1;
  int result = run_server(&server, port, "Lumen Socket.IO chat listening on");
  close(server.root_fd);
  return result;
}

static int lumen_http_serve_files_value(int port, const char *root) {
  LumenHttpServer server;
  memset(&server, 0, sizeof(server));
  server.mode = LUMEN_SERVER_FILES;
  server.root_fd = open_root(root);
  if (server.root_fd < 0) return 1;
  int result = run_server(&server, port, NULL);
  close(server.root_fd);
  return result;
}

static int lumen_http_serve_api_value(int port, const char *method, const char *route, const char *headers, const char *body) {
  LumenHttpServer server;
  memset(&server, 0, sizeof(server));
  server.mode = LUMEN_SERVER_API;
  server.root_fd = -1;
  server.api_method = method;
  server.api_route = route;
  server.api_headers = headers;
  server.api_body = body;
  return run_server(&server, port, NULL);
}

static int lumen_http_serve_http_value(
  int port,
  const char *root,
  const char **methods,
  const char **routes,
  const char **headers,
  const char **bodies,
  int route_count
) {
  if (route_count < 0 || (route_count > 0 && (!methods || !routes || !headers || !bodies))) return 1;

  LumenHttpServer server;
  memset(&server, 0, sizeof(server));
  server.mode = LUMEN_SERVER_HTTP;
  server.root_fd = open_root(root);
  if (server.root_fd < 0) return 1;
  server.methods = methods;
  server.routes = routes;
  server.headers = headers;
  server.bodies = bodies;
  server.route_count = route_count;

  int result = run_server(&server, port, "Lumen HTTP listening on");
  close(server.root_fd);
  return result;
}

void *lumen_socketio_event(const char *event, const char *payload) {
  char *value = lumen_socketio_event_value(event, payload);
  if (!value) return lumen_runtime_error("http", ENOMEM, "cannot build Socket.IO event");
  return lumen_ok(value);
}

void *lumen_socketio_emit(const char *room, const char *event, const char *payload) {
  char *value = lumen_socketio_emit_value(room, event, payload);
  if (!value) return lumen_runtime_error("http", ENOMEM, "cannot build Socket.IO message");
  return lumen_ok(value);
}

void *lumen_http_request(const char *method, const char *path, const char *body) {
  char *value = lumen_http_request_value(method, path, body);
  if (!value) return lumen_runtime_error("http", ENOMEM, "cannot build HTTP request");
  return lumen_ok(value);
}

void *lumen_http_response(int status, const char *headers, const char *body) {
  char *value = lumen_http_response_value(status, headers, body);
  if (!value) return lumen_runtime_error("http", ENOMEM, "cannot build HTTP response");
  return lumen_ok(value);
}

void *lumen_socketio_serve_chat(int port, const char *root) {
  int code = lumen_socketio_serve_chat_value(port, root);
  if (code != 0) return lumen_runtime_error("http", code, "Socket.IO server failed");
  return lumen_ok_i32(0);
}

void *lumen_http_serve_files(int port, const char *root) {
  int code = lumen_http_serve_files_value(port, root);
  if (code != 0) return lumen_runtime_error("http", code, "file server failed");
  return lumen_ok_i32(0);
}

void *lumen_http_serve_api(
  int port,
  const char *method,
  const char *route,
  const char *headers,
  const char *body
) {
  int code = lumen_http_serve_api_value(port, method, route, headers, body);
  if (code != 0) return lumen_runtime_error("http", code, "API server failed");
  return lumen_ok_i32(0);
}

void *lumen_http_serve_http(
  int port,
  const char *root,
  const char **methods,
  const char **routes,
  const char **headers,
  const char **bodies,
  int route_count
) {
  int code = lumen_http_serve_http_value(
    port,
    root,
    methods,
    routes,
    headers,
    bodies,
    route_count
  );
  if (code != 0) return lumen_runtime_error("http", code, "HTTP server failed");
  return lumen_ok_i32(0);
}
