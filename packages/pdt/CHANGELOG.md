## [0.2.1](https://github.com/ulenarofmondarth/pdt/compare/v0.2.0...v0.2.1) (2026-10-18)

### Bug Fixes

* **cli:** exit with a usage error code for an invalid command line ([8547d71](https://github.com/ulenarofmondarth/pdt/commit/8547d71218b6f4c1f147ff84b5efa66456910ad3))
* **cli:** reject an unknown vtt sub-command ([7765d2b](https://github.com/ulenarofmondarth/pdt/commit/7765d2b797853db71aa2e3b3a581a5e1277dc418))
* **config:** read the user and project configuration files ([32adc42](https://github.com/ulenarofmondarth/pdt/commit/32adc424573cb6ea5649dc9229133e7eff8631b5))
* **deps:** update dependencies with known vulnerabilities ([40dc469](https://github.com/ulenarofmondarth/pdt/commit/40dc4699fd7005b2ca6cdef68125f78de25a37ab))
* **docker:** pull the server image only when it is missing ([5977eb1](https://github.com/ulenarofmondarth/pdt/commit/5977eb1a1c70e48658c17f872be45c645b7329ed))
* **docker:** read image pull progress line by line ([33b63d4](https://github.com/ulenarofmondarth/pdt/commit/33b63d4c22142c6458a48ee31c89902e48bd8375))
* **logger:** keep running when the log file cannot be written ([7b491d2](https://github.com/ulenarofmondarth/pdt/commit/7b491d2dc95d850315a69b4f21d44b13b238c0f0))
* **logger:** write log messages to standard error ([6bd505d](https://github.com/ulenarofmondarth/pdt/commit/6bd505da21932cc41f60d2c09dbb952dbbcd0e40))
* **vtt:** wait for a server to start, and report when it cannot ([5587570](https://github.com/ulenarofmondarth/pdt/commit/55875701c2a96e4e3b5dea09d7aa28f74a26f1f7))

## [0.2.0](https://github.com/ulenarofmondarth/pdt/compare/v0.1.0...v0.2.0) (2026-10-15)

### Features

* **.pdt:** adds use of .pdt runtime config ([08498cf](https://github.com/ulenarofmondarth/pdt/commit/08498cffff39704473c0e090ef95e871c7fe71aa))
* **cli:** accept the generator answers as options on init ([0912083](https://github.com/ulenarofmondarth/pdt/commit/09120838194ec17128775297e954a6dde9f9ce57))
* **cli:** add info command skeleton ([04ac989](https://github.com/ulenarofmondarth/pdt/commit/04ac9896207acd9efd4c2488c756ba4650743aa2))
* **cli:** add init command ([1c02187](https://github.com/ulenarofmondarth/pdt/commit/1c021877779b36823d9b22cec01166441127901c))
* **cli:** create a new module when init runs in an empty directory ([56c1f60](https://github.com/ulenarofmondarth/pdt/commit/56c1f60de902bc1c3d54ee9dc0dbd31a436a8048))
* **cli:** warn when new module options are given but not used ([3de7bf7](https://github.com/ulenarofmondarth/pdt/commit/3de7bf7abe0d07e1b4df371d3e806faa52eb4946))
* **compendium:** import multilpe sources by wildcard or list ([88b579b](https://github.com/ulenarofmondarth/pdt/commit/88b579bce8f49527611e63ce73079c24404fd9d0))
* **config:** adds validated configuration file ([f979aab](https://github.com/ulenarofmondarth/pdt/commit/f979aab5b3331951104a731181ffcacc6c199b1b))
* **i18n:** add French and Spanish translations ([7e42046](https://github.com/ulenarofmondarth/pdt/commit/7e42046409065c4a12942dca0902ee244763170a))
* **i18n:** add German translations ([4a079d6](https://github.com/ulenarofmondarth/pdt/commit/4a079d60b5d3486cbc3f5845fd4a479ca430d878))
* **i18n:** add paraglide i18n ([7804ab9](https://github.com/ulenarofmondarth/pdt/commit/7804ab96795cbecc04f4a1363916a7390d20d1f4))

### Bug Fixes

* **cli:** exit with an error code when a command fails ([c816ddf](https://github.com/ulenarofmondarth/pdt/commit/c816ddf4366c2cea5e6d802bb1c0c290bdf14078))
* **compendium:** ensure compendium db closes ([56b1224](https://github.com/ulenarofmondarth/pdt/commit/56b12243eed2cae2a301aeed2f984b89b6382a77))
* **compendium:** stop probe creating files at the probed path ([65168f5](https://github.com/ulenarofmondarth/pdt/commit/65168f5fdc187abeffd5b892375fde038f82870a))
* **config:** change VTT server config data format ([b862198](https://github.com/ulenarofmondarth/pdt/commit/b8621988ee9f87a8ff508e298de44a32a30212e8))
* **config:** correctly builds evn mappings into config ([f75fde3](https://github.com/ulenarofmondarth/pdt/commit/f75fde3568f0362e7e1fdcecad8e9f059e3b9dc2))
* **config:** stop project search hanging outside home ([9ecd9fe](https://github.com/ulenarofmondarth/pdt/commit/9ecd9fe91be9fa93ef53e7a450736ee8770bf6f3))
* **docker:** detach new server containers from stdout ([5cc0885](https://github.com/ulenarofmondarth/pdt/commit/5cc08854ec2beab6ee12bb184a5919771159ee1f))
* **docker:** name containers and images after the server ([a3c3aec](https://github.com/ulenarofmondarth/pdt/commit/a3c3aec2d825169af48a829ca65a1c3d81700b01))
* **docs:** corrects path used for docs ([68137f5](https://github.com/ulenarofmondarth/pdt/commit/68137f53aaa8af750e0c8c4bb900ff7921727b88))
* **i18n:** correct spelling in the English messages ([8f84201](https://github.com/ulenarofmondarth/pdt/commit/8f84201e4b3fa6f8dd93ef9ba8731eb1c33eb750))
* **logger:** write log file reliably and allow retargeting ([3b8409c](https://github.com/ulenarofmondarth/pdt/commit/3b8409c4db9dc02e902c814634ca36b5f1d88d6f))
