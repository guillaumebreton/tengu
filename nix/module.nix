{
  config,
  lib,
  pkgs,
  tenguPackage,
  ...
}:
let
  cfg = config.services.tengu;
in
{
  options.services.tengu = {
    enable = lib.mkEnableOption "Tengu durable Pi agents";

    package = lib.mkOption {
      type = lib.types.package;
      default = tenguPackage;
      description = "Tengu package to run.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address on which Tengu listens.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8787;
      description = "Port on which Tengu listens.";
    };

    workspace = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/tengu/workspace";
      description = "Shared workspace visible to every agent.";
    };

    agentDirectory = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/tengu/home";
      description = "Isolated Pi agent directory containing auth.json and optional models.json.";
    };

    authFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Optional runtime credential file copied to the isolated Pi auth.json.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.groups.tengu = { };
    users.users.tengu = {
      isSystemUser = true;
      group = "tengu";
      home = "/var/lib/tengu/home";
    };

    systemd.tmpfiles.rules = [
      "d ${cfg.workspace} 0700 tengu tengu -"
      "d ${cfg.agentDirectory} 0700 tengu tengu -"
    ];

    systemd.services.tengu = {
      description = "Tengu durable Pi agents";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      path = with pkgs; [
        bash
        coreutils
        gh
        git
        openssh
      ];
      environment = {
        TENGU_HOST = cfg.host;
        TENGU_PORT = toString cfg.port;
        TENGU_STATE = "/var/lib/tengu/tengu.sqlite";
        TENGU_WORKSPACE = toString cfg.workspace;
        TENGU_HOME = toString cfg.agentDirectory;
      };
      preStart = lib.optionalString (cfg.authFile != null) ''
        install -m 0600 ${cfg.authFile} ${cfg.agentDirectory}/auth.json
      '';
      serviceConfig = {
        User = "tengu";
        Group = "tengu";
        ExecStart = lib.getExe cfg.package;
        Restart = "on-failure";
        RestartSec = 2;
        StateDirectory = "tengu";
        StateDirectoryMode = "0700";
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [
          cfg.workspace
          cfg.agentDirectory
        ];
      };
    };
  };
}
