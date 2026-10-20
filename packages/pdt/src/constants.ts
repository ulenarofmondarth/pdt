const constants = {
  PROGRAM_NAME: 'pdt', // The name used to invoke the PDT
  PROJECT_RTD_DIR_NAME: '.pdt', // The name for the directory holding a project's run-time data
  EXITCODE: {
    OK: 0,
    ERROR: 1, // An unexpected error stopped the command
    USAGE: 2, // The command line could not be run: no command, or an unknown command or option
    INVALID_CONFIG: 127,
  },
};

export default constants;
