# Releases

Releases are managed manually. They are always manually triggered from a developer's machine with release scripts for 
both python and javascript packages:

## Production

- Create a new local feature branch, e.g. `git checkout -b release/v0.2.5`
- Generate artifacts:
```bash
npm run build
cp ./build/contracts/* ./artifacts/
```
- Update contracts documentation
```bash
npm run doc:gen
```

- install bumpversion `pip install bumpversion` (if you don't have it installed on your machine)

Use the `bumpversion.sh` script to bump the project version. You can execute the script using {major|minor|patch} as first argument to bump the version accordingly:

- To bump the patch version: ./bumpversion.sh patch
- To bump the minor version: ./bumpversion.sh minor
- To bump the major version: ./bumpversion.sh major

assuming we are on version `v0.2.4` and the desired version is `v0.2.5`. `./bumpversion.sh` patch has to be run.

- run `npm i` to update the version in `package-lock.json`


```bash
export MNEMONIC='YOUR MNEMONIC SHOULD BE HERE'
# If you are using remote test or main net using Infura
export INFURA_TOKEN='GET INFURA_TOKEN FROM INFURA PLATFORM' 
npm run deploy:rinkeby
```
- Update the changelog using [auto-changelog](https://github.com/CookPete/auto-changelog)
```bash
auto-changelog -v v0.2.5
```
- Commit the missing changes to the feature branch:

```bash
git add .
git commit -m 'v0.2.5'
git push
```
- Tag the last commit with the new version number ie. v0.2.5
```bash
git tag -a v0.2.5
```
- Push the feature branch to GitHub.
```
git push --tags
```
- Make a pull request from the just-pushed branch to develop branch.
- Wait for all the tests to pass!
- Merge the pull request into the develop branch.
