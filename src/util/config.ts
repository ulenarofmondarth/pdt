import CONSTANTS from '@/constants.js';
import './fudge_node_config.js';
import config from 'config';
import { z } from 'zod/v4';
import { config as configSchema } from '@schema/config.js';

function renderConfigIssues(issues: z.ZodIssue[]) {
  const simple = issues.map(issue => `${issue.path.join('.')} ${issue.message}`);
  console.log(`\t${simple.join('\n\t')}`);
}

try {
  configSchema.parse(config.util.toObject());
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log('Error in configuration.\n');
    renderConfigIssues(error.issues);
    process.exit(CONSTANTS.EXITCODE.INVALID_CONFIG);
  } else throw error;
}

export default config;
