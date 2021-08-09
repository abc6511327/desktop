import * as fse from 'fs-extra'
import memoizeOne from 'memoize-one'
import { enableWindowsOpenSSH } from '../feature-flag'
import { getFileHash } from '../file-system'
import { getBoolean } from '../local-storage'
import { TokenStore } from '../stores'

const WindowsOpenSSHPath = 'C:/Windows/System32/OpenSSH/ssh.exe'

export const UseWindowsOpenSSHKey: string = 'useWindowsOpenSSH'

export const isWindowsOpenSSHAvailable = memoizeOne(
  async (): Promise<boolean> => {
    if (!__WIN32__ || !enableWindowsOpenSSH()) {
      return false
    }

    // FIXME: for now, seems like we can't use Windows' OpenSSH binary on Windows
    // for ARM.
    if (process.arch === 'arm64') {
      return false
    }

    return await fse.pathExists(WindowsOpenSSHPath)
  }
)

// HACK: The purpose of this function is to wrap `getBoolean` inside a try/catch
// block, because for some reason, accessing localStorage from tests sometimes
// fails.
function isWindowsOpenSSHUseEnabled() {
  try {
    return getBoolean(UseWindowsOpenSSHKey, false)
  } catch (e) {
    return false
  }
}

/**
 * Returns the git environment variables related to SSH depending on the current
 * context (OS and user settings).
 */
export async function getSSHEnvironment() {
  const canUseWindowsSSH = await isWindowsOpenSSHAvailable()
  if (canUseWindowsSSH && isWindowsOpenSSHUseEnabled()) {
    return {}
  }

  if (canUseWindowsSSH && getBoolean(UseWindowsOpenSSHKey, false)) {
    // Replace git ssh command with Windows' OpenSSH executable path
    return {
      GIT_SSH_COMMAND: WindowsOpenSSHPath,
    }
  }

  return {}
}

const SSHKeyPassphraseTokenStoreKey = 'GitHub-Desktop-SSHKeyPassphrases'

async function getHashForSSHKey(keyPath: string) {
  return getFileHash(keyPath, 'sha256')
}

/** Retrieves the passphrase for the SSH key in the given path. */
export async function getSSHKeyPassphrase(keyPath: string) {
  const fileHash = await getHashForSSHKey(keyPath)
  return TokenStore.getItem(SSHKeyPassphraseTokenStoreKey, fileHash)
}

/** Stores the passphrase for the SSH key in the given path. */
export async function storeSSHKeyPassphrase(
  keyPath: string,
  passphrase: string
) {
  const fileHash = await getHashForSSHKey(keyPath)
  return TokenStore.setItem(SSHKeyPassphraseTokenStoreKey, fileHash, passphrase)
}
