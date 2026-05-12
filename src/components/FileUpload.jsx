import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function getPublicUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from('comprobantes').getPublicUrl(path)
  return data.publicUrl
}

export default function FileUpload({ path, onUpload, label }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const isImage = (p) => p && /\.(jpg|jpeg|png|gif|webp)$/i.test(p)

  const handleChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setError('')
    setUploading(true)

    const ext = file.name.split('.').pop().toLowerCase()
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { data, error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    setUploading(false)

    if (uploadError) {
      setError('Error al subir: ' + uploadError.message)
    } else {
      onUpload(data.path)
    }
  }

  const publicUrl = getPublicUrl(path)

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      )}

      {path && (
        <div className="mb-2">
          {isImage(path) ? (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={publicUrl}
                alt="comprobante"
                className="h-16 rounded border border-gray-200 object-cover cursor-pointer hover:opacity-80 transition-opacity"
              />
            </a>
          ) : (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
            >
              <span>📄</span> Ver comprobante
            </a>
          )}
        </div>
      )}

      <label className="inline-flex items-center gap-2 cursor-pointer">
        <span className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg transition-colors border border-gray-300">
          {uploading ? 'Subiendo...' : path ? 'Reemplazar' : 'Adjuntar'}
        </span>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={handleChange}
          disabled={uploading}
          className="hidden"
        />
        {path && !uploading && (
          <span className="text-xs text-green-600 font-medium">✓ Subido</span>
        )}
      </label>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
