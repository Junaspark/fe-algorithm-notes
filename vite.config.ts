import path from 'node:path'

const config = {
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
}

export default config
