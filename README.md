# Tengu

A private web interface for durable Pi coding agents.

## Packages

Tengu is packaged with Nix:

```sh
nix run github:guillaumebreton/tengu
```

Tagged releases also publish:

- `tengu-<version>-linux-x86_64.tar.gz` on GitHub Releases;
- `ghcr.io/guillaumebreton/tengu:<version>` and `:latest` OCI images.

The image listens on port 3000 and persists data in `/var/lib/tengu`. Mount the shared agent workspace at `/workspace` and provide Pi credentials under `/var/lib/tengu/pi`.

```sh
docker run --rm -p 3000:3000 \
  -v tengu-state:/var/lib/tengu \
  -v "$PWD:/workspace" \
  ghcr.io/guillaumebreton/tengu:latest
```

## Releases

`package.json` is the version source. To release, update its version and lockfile, then push a matching `v<version>` tag. CI rejects a tag that does not match `package.json`.
