#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static int make_server(int port) {
  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return 1;

  int yes = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_ANY);
  address.sin_port = htons((uint16_t)port);

  if (bind(server, (struct sockaddr *)&address, sizeof(address)) < 0) {
    close(server);
    return -1;
  }

  if (listen(server, 16) < 0) {
    close(server);
    return -1;
  }

  return server;
}

static void write_response(int client, int status, const char *type, const char *body, size_t length) {
  const char *status_text = status == 200 ? "OK" : "Not Found";
  char header[256];
  int header_length = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    status_text,
    type,
    length
  );

  send(client, header, (size_t)header_length, 0);
  send(client, body, length, 0);
}

static void write_response_with_headers(int client, int status, const char *headers, const char *body, size_t length) {
  const char *status_text = status == 200 ? "OK" : "Not Found";
  char header[1024];
  int header_length = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\n%sContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    status_text,
    headers,
    length
  );

  send(client, header, (size_t)header_length, 0);
  send(client, body, length, 0);
}

static const char *content_type(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) return "text/plain";
  if (strcmp(dot, ".html") == 0) return "text/html";
  if (strcmp(dot, ".css") == 0) return "text/css";
  if (strcmp(dot, ".js") == 0) return "text/javascript";
  if (strcmp(dot, ".json") == 0) return "application/json";
  return "text/plain";
}

static void request_path(const char *request, char *out, size_t out_size) {
  const char *start = strchr(request, ' ');
  if (!start) {
    snprintf(out, out_size, "/");
    return;
  }

  start += 1;
  const char *end = strchr(start, ' ');
  if (!end) end = start + strlen(start);

  size_t length = (size_t)(end - start);
  if (length >= out_size) length = out_size - 1;

  memcpy(out, start, length);
  out[length] = '\0';

  char *query = strchr(out, '?');
  if (query) *query = '\0';
}

static void request_method(const char *request, char *out, size_t out_size) {
  const char *end = strchr(request, ' ');
  if (!end) {
    snprintf(out, out_size, "GET");
    return;
  }

  size_t length = (size_t)(end - request);
  if (length >= out_size) length = out_size - 1;

  memcpy(out, request, length);
  out[length] = '\0';
}

int lumen_http_serve_files(int port, const char *root) {
  int server = make_server(port);
  if (server < 0) return 1;

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char path[512];
    request_path(request, path, sizeof(path));

    if (strstr(path, "..")) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(path, "/") == 0) snprintf(path, sizeof(path), "/index.html");

    char full_path[1024];
    snprintf(full_path, sizeof(full_path), "%s%s", root, path);

    FILE *file = fopen(full_path, "rb");
    if (!file) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *body = malloc((size_t)size);
    if (!body) {
      fclose(file);
      close(client);
      continue;
    }

    fread(body, 1, (size_t)size, file);
    fclose(file);

    write_response(client, 200, content_type(full_path), body, (size_t)size);
    free(body);
    close(client);
  }
}

int lumen_http_serve_api(int port, const char *method, const char *route, const char *headers, const char *body) {
  int server = make_server(port);
  if (server < 0) return 1;

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char path[512];
    char actual_method[32];
    request_method(request, actual_method, sizeof(actual_method));
    request_path(request, path, sizeof(path));

    if (strcmp(actual_method, method) == 0 && strcmp(path, route) == 0) {
      write_response_with_headers(client, 200, headers, body, strlen(body));
    } else {
      const char *missing = "not found\n";
      write_response(client, 404, "text/plain", missing, strlen(missing));
    }

    close(client);
  }
}

int lumen_http_serve_http(
  int port,
  const char *root,
  const char **methods,
  const char **routes,
  const char **headers,
  const char **bodies,
  int route_count
) {
  int server = make_server(port);
  if (server < 0) return 1;

  printf("Lumen HTTP listening on http://localhost:%d\n", port);
  fflush(stdout);

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char method[32];
    char path[512];
    request_method(request, method, sizeof(method));
    request_path(request, path, sizeof(path));

    int handled = 0;
    for (int i = 0; i < route_count; i += 1) {
      if (strcmp(method, methods[i]) == 0 && strcmp(path, routes[i]) == 0) {
        write_response_with_headers(client, 200, headers[i], bodies[i], strlen(bodies[i]));
        handled = 1;
        break;
      }
    }

    if (handled) {
      close(client);
      continue;
    }

    if (strstr(path, "..")) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(path, "/") == 0) snprintf(path, sizeof(path), "/index.html");

    char full_path[1024];
    snprintf(full_path, sizeof(full_path), "%s%s", root, path);

    FILE *file = fopen(full_path, "rb");
    if (!file) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *body = malloc((size_t)size);
    if (!body) {
      fclose(file);
      close(client);
      continue;
    }

    fread(body, 1, (size_t)size, file);
    fclose(file);

    write_response(client, 200, content_type(full_path), body, (size_t)size);
    free(body);
    close(client);
  }
}
