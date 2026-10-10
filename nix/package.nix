{
  lib,
  buildNpmPackage,
  makeWrapper,
  nodejs_24,
}:
buildNpmPackage {
  pname = "tengu";
  version = (lib.importJSON ../package.json).version;
  src = lib.cleanSource ../.;

  npmDepsHash = "sha256-8dDzlEJL5I2lajrDn41vcXK1qrPKO8eWPOF0qlRCpfA=";
  nativeBuildInputs = [ makeWrapper ];
  nodejs = nodejs_24;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib/tengu $out/bin
    cp -r build dist node_modules package.json $out/lib/tengu/
    makeWrapper ${nodejs_24}/bin/node $out/bin/tengu \
      --add-flags "$out/lib/tengu/build/main.js" \
      --set-default TENGU_PUBLIC "$out/lib/tengu/dist"
    runHook postInstall
  '';

  meta = {
    description = "A minimal web interface for durable Pi coding agents";
    license = lib.licenses.mit;
    mainProgram = "tengu";
    platforms = lib.platforms.unix;
  };
}
