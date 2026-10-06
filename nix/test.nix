{
  pkgs,
  self,
}:
pkgs.testers.runNixOSTest {
  name = "tengu";

  nodes.machine = {
    imports = [ self.nixosModules.default ];
    services.tengu = {
      enable = true;
      authFile = pkgs.writeText "auth.json" ''
        {"openai":{"type":"api_key","key":"test-key"}}
      '';
    };
  };

  testScript = ''
    machine.start()
    machine.wait_for_unit("tengu.service")
    machine.wait_for_open_port(8787)
    machine.succeed("curl --fail http://127.0.0.1:8787/ | grep '<title>Tengu</title>'")
    machine.succeed("curl --fail http://127.0.0.1:8787/api/agents | grep '\\[\\]'")
    machine.fail("curl --fail --connect-timeout 1 http://$(hostname -I | awk '{print $1}'):8787/")
    machine.succeed("systemctl restart tengu.service")
    machine.wait_for_unit("tengu.service")
    machine.succeed("test -f /var/lib/tengu/tengu.sqlite")
  '';
}
