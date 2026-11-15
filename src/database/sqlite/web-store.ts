/**
 * Web SQLite element registration.
 *
 * jeep-sqlite is a Stencil custom element. The element is present in
 * index.html, but its implementation is loaded asynchronously so the main
 * bundle stays small. `initWebStore()` awaits `customElements.whenDefined`, so
 * this module must finish registration before the database is initialised.
 */

const ELEMENT_TAG = 'jeep-sqlite'
const REGISTRATION_TIMEOUT_MS = 10_000

let initialization: Promise<void> | null = null

async function waitForElementDefinition(): Promise<void> {
  let timer: number | undefined

  try {
    await Promise.race([
      customElements.whenDefined(ELEMENT_TAG),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(`Timed out registering <${ELEMENT_TAG}>`))
        }, REGISTRATION_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer !== undefined) window.clearTimeout(timer)
  }
}

export async function ensureWebSqlite(): Promise<void> {
  if (initialization) return initialization

  initialization = (async () => {
    if (!document.querySelector(ELEMENT_TAG)) {
      const element = document.createElement(ELEMENT_TAG)
      element.setAttribute('autosave', 'true')
      document.body.appendChild(element)
    }

    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(window)
    await waitForElementDefinition()
  })().catch(err => {
    initialization = null
    throw err
  })

  return initialization
}
