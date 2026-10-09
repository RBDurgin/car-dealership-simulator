import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Whether `error` is the browser refusing to give the page a WebGL context. */
function isWebGLError(error: unknown): boolean {
  return error instanceof Error && /WebGL/i.test(error.message)
}

/**
 * Catches an error that would otherwise unmount the whole app and leave a
 * blank page, and says what happened instead. The usual one is WebGL being
 * unavailable: the browser blocks it for a site after the GPU drops its
 * context a few times, until the browser restarts. The save is only written
 * at the end of a day, so nothing is lost.
 */
export class CrashScreen extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('The game stopped:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    const webgl = isWebGLError(error)
    return (
      <div className="hud">
        <div className="modal-backdrop">
          <div className="panel day-summary title-screen" role="alertdialog" aria-label="Error">
            <div className="info-kicker">Car dealership simulator</div>
            <h1>{webgl ? '3D graphics are unavailable' : 'Something went wrong'}</h1>
            {webgl ? (
              <p>
                Your browser wouldn&apos;t start 3D graphics for this page. This usually happens
                after the graphics card resets a few times: the browser blocks the page until
                it&apos;s restarted. Quit and reopen the browser, then try again.
              </p>
            ) : (
              <p>
                The game hit an error and stopped.{' '}
                <span className="muted">
                  {error instanceof Error ? error.message : String(error)}
                </span>
              </p>
            )}
            <p className="muted">Your save is kept: the game only saves at the end of a day.</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
