/* Loads the app again from the start. One place, so a test can replace it (jsdom cannot navigate). */
export const reloadApp = () => window.location.reload()
