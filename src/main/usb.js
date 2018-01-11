// @flow

import objectPath from 'object-path'

import CommNodeHid from '@ledgerhq/hw-transport-node-hid'
import listenDevices from '@ledgerhq/hw-transport-node-hid/lib/listenDevices'
import getDevices from '@ledgerhq/hw-transport-node-hid/lib/getDevices'

import Btc from '@ledgerhq/hw-app-btc'

process.title = 'ledger-wallet-desktop-usb'

const isLedgerDevice = device =>
  (device.vendorId === 0x2581 && device.productId === 0x3b7c) || device.vendorId === 0x2c97

function send(type: string, data: any, options = { kill: true }) {
  process.send({ type, data, options })
}

async function getWalletInfos(path, wallet) {
  if (wallet === 'btc') {
    const comm = new CommNodeHid(path, true, 0, false)
    const btc = new Btc(comm)
    const walletInfos = await btc.getWalletPublicKey(`44'/0'/0'/0`)
    return walletInfos
  }
  throw new Error('invalid wallet')
}

let isListenDevices = false

const handlers = {
  devices: {
    listen: () => {
      if (isListenDevices) {
        return
      }

      isListenDevices = true

      const handleChangeDevice = eventName => device =>
        isLedgerDevice(device) && send(eventName, device, { kill: false })

      listenDevices.start()

      listenDevices.events.on('add', handleChangeDevice('device.add'))
      listenDevices.events.on('remove', handleChangeDevice('device.remove'))
    },
    all: () => send('devices.update', getDevices().filter(isLedgerDevice)),
  },
  wallet: {
    infos: {
      request: async ({ path, wallet }) => {
        try {
          const publicKey = await getWalletInfos(path, wallet)
          send('wallet.infos.success', { path, publicKey })
        } catch (err) {
          send('wallet.infos.fail', { path, err: err.stack || err })
        }
      },
    },
  },
}

process.on('message', payload => {
  const { type, data } = payload

  const handler = objectPath.get(handlers, type)
  if (!handler) {
    return
  }

  handler(data)
})
