'use client'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel empty"><p className="eyebrow">LET’S TRY THAT AGAIN</p><h1>We couldn’t load this view.</h1><p className="muted">Check the database connection and admin migration, then try again. No data was exposed.</p><button className="button" onClick={reset}>Try again</button></section>
}
