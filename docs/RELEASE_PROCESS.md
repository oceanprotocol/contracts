# Releases

Releases are managed semi-automatically. They are always manually triggered from a developer's machine with release scripts.

## Production

From a clean `master` branch you can run any release task bumping the version accordingly based on semantic versioning:

- To bump a patch version: `npm run release`
- To bump a minor version: `npm run release -- minor`
- To bump a major version: `npm run release -- major`

Every task does the following:

- bumps the project version in `package.json`, `package-lock.json`
- auto-generates and updates the [CHANGELOG.md](../CHANGELOG.md) file from commit messages
- creates a Git tag
- commits and pushes everything
- creates a GitHub release with commit messages as description
- Git tag push will trigger Travis to do a npm release

For the GitHub releases steps a GitHub personal access token, exported as `GITHUB_TOKEN` is required. [Setup](https://github.com/release-it/release-it#github-releases)

## Pre-Releases

Usually from a feature branch you can release a develop version under the `next` npm tag.

Say the current version is at `v1.1.0`, then to publish a pre-release for a next major version `v2.0.0-beta.0`, do:

```bash
npm run release -- major --preRelease=beta --npm.tag=next

# consecutive releases, e.g. to then get `v2.0.0-beta.1`
npm run release -- --preRelease

# final version, e.g. to then get `v2.0.0`
npm run release -- major
```