// This is needed to ensure the NODE_CONFIG_DIR environment variable is set BEFORE node-config is loaded
import PDT from '@/constants.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { pfs } from '@util/runtime-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// eslint-disable-next-line no-undef
const current_config_dir = process.env.NODE_CONFIG_DIR || `${path.join(__dirname, '..', PDT.CONF_DIR)}`;
// eslint-disable-next-line no-undef
process.env.NODE_CONFIG_DIR = `${path.join(pfs.userDataDir, PDT.PROGRAM_NAME)}${path.delimiter}${current_config_dir}`;
