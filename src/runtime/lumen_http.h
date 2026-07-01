#ifndef LUMEN_RUNTIME_HTTP_H
#define LUMEN_RUNTIME_HTTP_H

void *lumen_socketio_event(const char *event, const char *payload);
void *lumen_socketio_emit(const char *room, const char *event, const char *payload);
void *lumen_http_request(const char *method, const char *path, const char *body);
void *lumen_http_response(int status, const char *headers, const char *body);
void *lumen_socketio_serve_chat(int port, const char *root);
void *lumen_http_serve_files(int port, const char *root);
void *lumen_http_serve_api(
  int port,
  const char *method,
  const char *route,
  const char *headers,
  const char *body
);
void *lumen_http_serve_http(
  int port,
  const char *root,
  const char **methods,
  const char **routes,
  const char **headers,
  const char **bodies,
  int route_count
);

#endif
