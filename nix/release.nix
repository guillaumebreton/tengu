{
  buildEnv,
  dockerTools,
  lib,
  runCommand,
  tengu,
}:
let
  version = tengu.version;
  root = buildEnv {
    name = "tengu-root";
    paths = [ tengu ];
    pathsToLink = [ "/bin" ];
  };
in
{
  tarball = runCommand "tengu-${version}-linux-${tengu.stdenv.hostPlatform.linuxArch}.tar.gz" { } ''
    mkdir -p root
    cp -RL ${tengu}/. root/
    tar -C root --sort=name --mtime=@1 --owner=0 --group=0 --numeric-owner -czf $out .
  '';

  image = dockerTools.buildLayeredImage {
    name = "tengu";
    tag = version;
    contents = [ root ];
    config = {
      Entrypoint = [ "/bin/tengu" ];
      Env = [
        "TENGU_HOST=0.0.0.0"
        "TENGU_PORT=3000"
        "TENGU_STATE=/var/lib/tengu/tengu.sqlite"
        "TENGU_WORKSPACE=/workspace"
        "TENGU_HOME=/var/lib/tengu/pi"
      ];
      ExposedPorts = {
        "3000/tcp" = { };
      };
      WorkingDir = "/workspace";
      Volumes = {
        "/var/lib/tengu" = { };
        "/workspace" = { };
      };
      Labels = {
        "org.opencontainers.image.title" = "Tengu";
        "org.opencontainers.image.description" = "A minimal web interface for durable Pi coding agents";
        "org.opencontainers.image.source" = "https://github.com/guillaumebreton/tengu";
        "org.opencontainers.image.version" = version;
        "org.opencontainers.image.licenses" = "MIT";
      };
    };
  };
}
