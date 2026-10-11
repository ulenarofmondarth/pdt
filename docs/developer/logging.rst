Logging
=======

Logging is provided using `winston <https://www.npmjs.com/package/winston>`_ via the ``@util/logger.ts`` module.

Simply:

.. code-block:: typescript

   import logger from '@util/logger.js';

Then use ``logger.info()`` etc.

Every message goes to the console and to the log file. Only messages at or above the configured level are output; the default level is ``warn``. Set the ``PDT_LOG_LEVEL`` environment variable (for example to ``debug``) to see more.


Where the log file is
---------------------

The log file is named by the ``Logging.filename`` configuration entry (``pdt.log`` by default). Its directory is chosen when the logger module loads:

- inside a |pdt| project it is the project's ``.pdt`` directory;
- anywhere else it is the user data directory (``~/.local/share/pdt`` on Linux).

The file is created when the first message is written, so a run that logs nothing leaves no file behind.

If the right directory only comes into existence during a run, call ``setLogDirectory()`` once it exists. ``pdt init`` does this so that its messages land in the project it has just created:

.. code-block:: typescript

   import logger, { setLogDirectory } from '@util/logger.js';

   setLogDirectory(pdtPath);
   logger.info('This goes to the new project log.');


Exiting the process
-------------------

Never call ``process.exit()`` directly once the logger is in use. Use ``exit()`` from the logger module, which waits until everything logged so far has been written:

.. code-block:: typescript

   import logger, { exit } from '@util/logger.js';

   logger.error('Something went badly wrong.');
   await exit(1);

``closeLogger()`` does the same wait without exiting. Both are terminal: nothing can be logged afterwards.

Log lines are appended to the file synchronously. winston's own file transport was not used because it reports itself finished before its output is on disk, which loses messages when the process exits promptly.
