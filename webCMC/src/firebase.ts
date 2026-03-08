import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyDdB_ArS_oYV19uLBXtVJ2gtzg-EBGfrpk',
  authDomain: 'studio-2202668842-5944b.firebaseapp.com',
  databaseURL: 'https://studio-2202668842-5944b-default-rtdb.firebaseio.com',
  projectId: 'studio-2202668842-5944b',
  storageBucket: 'studio-2202668842-5944b.firebasestorage.app',
  messagingSenderId: '832584758104',
  appId: '1:832584758104:web:269182f3135f3407102b2d',
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
