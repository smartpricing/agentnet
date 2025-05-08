import 'colors'

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'INFO'

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3
}

function argsToString (args) {
  return args.map(x => typeof x == 'string' ? x : JSON.stringify(x)).join(' ')
}

export function Debug (...args) {
  if (LOG_LEVELS[LOG_LEVEL] > LOG_LEVELS.DEBUG) {
    return
  }
  console.log(new Date(), '|', process.pid, '|', '#> [D]'.blue, argsToString(args).blue)
}

export function Info (...args) {
  if (LOG_LEVELS[LOG_LEVEL] > LOG_LEVELS.INFO) {
    return
  }

  console.log(new Date(), '|', process.pid, '|', '#> [I]'.gray, argsToString(args).gray)
}

export function Success (...args) {
  if (LOG_LEVELS[LOG_LEVEL] > LOG_LEVELS.INFO) {
    return
  }
  console.log(new Date(), '|', process.pid, '|', '#> [S]'.green, argsToString(args).green)
}

export function Warning (...args) {
  if (LOG_LEVELS[LOG_LEVEL] > LOG_LEVELS.WARNING) {
    return
  }
  console.log(new Date(), '|', process.pid, '|', '#> [W]'.yellow, argsToString(args).yellow)
}

export function Error (...args) {
  if (LOG_LEVELS[LOG_LEVEL] > LOG_LEVELS.ERROR) {
    return
  }
  console.log(new Date(), '|', process.pid, '|', '#> [E]'.red, argsToString(args).red)
}