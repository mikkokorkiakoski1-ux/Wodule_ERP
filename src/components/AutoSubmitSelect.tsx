"use client";

// Valintalista, joka lähettää lomakkeensa heti valinnan muuttuessa
// (esim. vaiheen tai vastuuhenkilön vaihto taulukon rivillä).
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
