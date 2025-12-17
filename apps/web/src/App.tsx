import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

function Home() {
  return (
    <div>
      <h1>OnlineLib</h1>
      <p>Free online library</p>
    </div>
  )
}

function Books() {
  return (
    <div>
      <h2>Books</h2>
      <p>Browse our collection</p>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link> | <Link to="/books">Books</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/books" element={<Books />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
