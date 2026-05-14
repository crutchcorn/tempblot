# Package Versioning and Release

- `pnpm version -r` to bump the version of the package. This will update the `package.json` files.
    - You must commit the changes to `package.json` files, make a new tag, and push the changes to the remote repository.
- `pnpm publish -r` to publish the package to npm. This will use the version specified in the `package.json` files. Make sure to run this command from the root of the project, as it will publish all packages in the monorepo.
    - Before publishing, ensure that you have the necessary permissions to publish the package to npm and that you are logged in to your npm account using `pnpm login`.