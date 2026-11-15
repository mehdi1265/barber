import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        gap: '1rem',
        fontFamily: 'inherit',
        direction: 'rtl',
      }}
    >
      <h1 style={{ fontSize: '4rem', margin: 0 }}>۴۰۴</h1>
      <p>صفحه‌ای که دنبالش می‌گردی پیدا نشد.</p>
      <button
        onClick={() => {
          void navigate('/', { replace: true })
        }}
      >
        بازگشت به خانه
      </button>
    </div>
  )
}
