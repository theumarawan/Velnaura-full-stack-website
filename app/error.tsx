"use client";
export default function AppError({ reset }: { reset: () => void }) {
  return <main className="public-home"><span className="eyebrow">Velnaura</span><h1>A small pause.</h1>
    <p>We couldn&apos;t load this page. Please try again shortly.</p><button className="button" onClick={reset}>Try again</button></main>;
}
