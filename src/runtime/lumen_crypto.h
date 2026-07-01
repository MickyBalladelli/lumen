#ifndef LUMEN_RUNTIME_CRYPTO_H
#define LUMEN_RUNTIME_CRYPTO_H

void *lumen_encrypt(const char *value, const char *password, const char *protocol);
void *lumen_decrypt(const char *value, const char *password, const char *protocol);

#endif
