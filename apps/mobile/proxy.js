const http = require('http')
const https = require('https')
const url = require('url')

const PORT = 8083
const TARGET = 'https://textstack.app'

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsed = url.parse(req.url)
  const options = {
    hostname: 'textstack.app',
    port: 443,
    path: parsed.path,
    method: req.method,
    headers: { ...req.headers, host: 'textstack.app' },
  }
  delete options.headers['origin']
  delete options.headers['referer']

  const proxyReq = https.request(options, (proxyRes) => {
    // Remove CORS headers from upstream, we add our own
    delete proxyRes.headers['access-control-allow-origin']
    res.writeHead(proxyRes.statusCode, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (e) => {
    res.writeHead(502)
    res.end('Proxy error: ' + e.message)
  })

  req.pipe(proxyReq)
})

server.listen(PORT, () => {
  console.log(`API proxy: http://localhost:${PORT} → ${TARGET}`)
})
