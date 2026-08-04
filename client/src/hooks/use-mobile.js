import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// El media query es un dato que vive afuera de React, así que se lee con
// useSyncExternalStore en vez de copiarlo a un estado desde un efecto: no hay
// render de más en el montaje y no queda un valor viejo entre el primer render
// y el efecto.
let mediaQuery

function getMediaQuery() {
  mediaQuery ??= window.matchMedia(MOBILE_QUERY)
  return mediaQuery
}

function subscribe(onStoreChange) {
  const mql = getMediaQuery()
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return getMediaQuery().matches
}

// En el servidor no hay viewport que medir. Se asume escritorio, que es lo que
// devolvía la versión anterior en el primer render (el estado arrancaba en
// undefined y salía como false).
function getServerSnapshot() {
  return false
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
