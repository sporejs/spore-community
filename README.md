## Core Idea

Only code for logic. Use editor for any configure/UI/router/translation/etc. Less code, less bug.

## Usage

TODO

## Develop and running sample

You should install [Git LFS](https://git-lfs.github.com) before clone this repo.

After clone, you should have `yarn` installed because this repo use "yarn workspace" to develop multi-package project.

```bash
npm install yarn -g
yarn
```

Some module require to build typescript file into javascript file, and some module require a extra build phase, all these can be done by:

```bash
yarn build:all
```

Now you can see some samples. Get into a sample directory then build and run it

```bash
cd samples/cli/hello
yarn build
yarn start
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
