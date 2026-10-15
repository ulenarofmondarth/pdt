const constants = {
  PROGRAM_NAME: 'pdt', // The name used to invoke the PDT
  CONF_DIR: 'pdt-internal-config', // The default directory, relative to __dirname, for configuration files
  PROJECT_RTD_DIR_NAME: '.pdt', // The name for the directory holding a project's run-time data
  EXITCODE: {
    ERROR: 1, // An unexpected error stopped the command
    INVALID_CONFIG: 127,
  },
};

export default constants;
