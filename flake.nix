{
  description = "Tengu durable Pi agents";

  inputs.nixpkgs.url = "https://flakehub.com/f/DeterminateSystems/nixpkgs-weekly/0.1";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      overlays.default = final: _prev: {
        tengu = final.callPackage ./nix/package.nix { };
      };

      packages = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ self.overlays.default ];
          };
          release = pkgs.callPackage ./nix/release.nix { };
        in
        {
          default = pkgs.tengu;
          tengu = pkgs.tengu;
        }
        // nixpkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          tarball = release.tarball;
          image = release.image;
        }
      );

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt-tree);

      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 ];
          };
        }
      );

      nixosModules.default = { pkgs, ... }: {
        imports = [ ./nix/module.nix ];
        _module.args.tenguPackage = self.packages.${pkgs.stdenv.hostPlatform.system}.tengu;
      };

      checks = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ self.overlays.default ];
          };
        in
        {
          package = pkgs.tengu;
        }
        // nixpkgs.lib.optionalAttrs pkgs.stdenv.hostPlatform.isLinux {
          nixos = import ./nix/test.nix { inherit pkgs self; };
        }
      );
    };
}
