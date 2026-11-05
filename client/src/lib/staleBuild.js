/* The browser says this when a file of the app is gone from the server, which is what an old tab meets after a deploy. */
export const isStaleBuild = (error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    `${error?.name ?? ''} ${error?.message ?? ''}`,
  )
