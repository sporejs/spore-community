import * as yargs from 'yargs';

type CliOption = any; // TODO;

interface CliCommands {
  command: string;
  aliases: string[];
  options: { [key: string]: CliOption };
  describe: string;
  handler: (args: yargs.Arguments<any>) => void;
}

interface CliApplication {
  usage: string;
  version: string;
  options: { [key: string]: CliOption };
  commands?: CliCommands[];
  handler?: (args: yargs.Arguments<any>) => void;
}

export default function(data: CliApplication) {
  return function() {
    if (data.usage) {
      yargs.usage(data.usage);
    }
    if (data.version) {
      yargs.version(data.version);
    }
    if (data.options) {
      for (const [key, value] of Object.entries(data.options)) {
        yargs.option(key, value);
      }
    }
    if (data.commands) {
      for (const cmd of data.commands) {
        const { command, aliases, options, describe, handler } = cmd;
        let builder;

        if (options) {
          builder = yargs => {
            for (const [key, value] of Object.entries(cmd.options)) {
              yargs.option(key, value);
            }
          };
        }
        yargs.command({
          command,
          aliases,
          describe,
          builder,
          handler,
        });
      }
      yargs.demandCommand();
    }
    if (data.handler) {
      data.handler(yargs.argv);
    } else {
      yargs.parse();
    }
  };
}
