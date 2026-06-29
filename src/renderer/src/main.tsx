import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import Home from './pages/Home'
import Detail from './pages/Detail'
import Player from './pages/Player'
import Search from './pages/Search'
import Season from './pages/Season'
import MyList from './pages/MyList'
import Downloads from './pages/Downloads'
import MyselfHome from './pages/MyselfHome'
import MyselfDetail from './pages/MyselfDetail'
import Recommend from './pages/Recommend'
import History from './pages/History'
import './index.css'

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'season/:key', element: <Season /> },
      { path: 'anime/:catId', element: <Detail /> },
      { path: 'search', element: <Search /> },
      { path: 'mylist', element: <MyList /> },
      { path: 'history', element: <History /> },
      { path: 'downloads', element: <Downloads /> },
      { path: 'recommend', element: <Recommend /> },
      { path: 'myself', element: <MyselfHome /> },
      { path: 'myself/anime/:id', element: <MyselfDetail /> }
    ]
  },
  { path: '/watch/:source/:animeId/:epId', element: <Player /> }
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
