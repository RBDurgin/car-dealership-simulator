import { beforeEach } from 'vitest'
import { resetRng } from './rng'

// Every test starts from day 1's rng streams and the first customer id, so
// store tests don't depend on the order they run in.
beforeEach(() => resetRng())
