.. _Contributing to PDT:

Contributing to PDT
===================


1. First, fork the PDT repository.

2. Configure you new repostory

  If you want to use the existing GitHub workflows on your local repository you will need to configure a personal access token.

  .. todo:: Add detail of presona access token

3. Create a local development environment for your new repository.

  .. highlight:: shell

  .. code-block::

    git clone <URL of your new forked repository>
    cd pdt
    npm install
    npm run prepare

  You are now set to develop PDT against your forked repository.

4. Submit a pull request

