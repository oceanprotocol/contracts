# Releases

Releases are managed manually. They are always manually triggered from a developer's machine with release scripts for both python and javascript packages:

## Production

- Create a new local feature branch, e.g. `git checkout -b release/v0.2.5`
- Give it an upstream branch, e.g. `git push --set-upstream origin release/v0.2.5`
- Generate artifacts:
```bash
npm run compile
rm ./artifacts/*
cp ./build/contracts/* ./artifacts/
```
- Update contracts documentation
```bash
npm run doc:generate
git add .
git commit -m 'prepare for a new release'
```

- Install bumpversion, if not done prior: `pip install bumpversion` 
- Use the `bumpversion.sh` script to bump the project version:
  - To bump the patch version: `./bumpversion.sh patch`
  - To bump the minor version: `./bumpversion.sh minor`
  - To bump the major version: `./bumpversion.sh major`
  - Example: if we're on version `v0.2.4` and new version is `v0.2.5`, then run `./bumpversion.sh patch`

- Run:
```bash
# Update the version in package-lock.json
npm i

export MNEMONIC='YOUR MNEMONIC SHOULD BE HERE'
# If you are using remote test or main net using Infura
export INFURA_TOKEN='GET INFURA_TOKEN FROM INFURA PLATFORM' 
npm run deploy:rinkeby
```

- Install [auto-changelog](https://github.com/CookPete/auto-changelog, if not done prior: `npm install -g auto-changelog`
- Update the changelog: `auto-changelog -v v0.2.5`

- Commit the missing changes to the feature branch. **Important**: these steps will trigger publishing the release in travis!

```bash
git add .
git commit -m 'v0.2.5'
git push
```

- Tag that commit with the new version number, e.g. v0.2.5
```bash
git tag -a v0.2.5
```
- Push the feature branch to GitHub.
```
git push --tags
```
- Make a pull request from the just-pushed branch to develop branch.
- Wait for all the tests to pass!
- Merge the pull request into the `master` branch.

Finally, draft the new release on github as follows:
- Go to [tags](https://github.com/oceanprotocol/ocean-contracts/tags), then select the new version tag.
- Click on `Edit release` button
- The naming convension for the release should be `Release vx.x.x`.
- Copy and paste the release related PRs from [CHANGELOG.md](../CHANGELOG.md) 
