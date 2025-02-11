import yargs from 'yargs';

export const parser = yargs.strict(true).help().demandCommand(1, 'At least one top level command is required.');
