import { connection } from 'next/server';
import FuelingCalculatorPage from './FuelingPage';

export default async function Page() {
  await connection();
  return <FuelingCalculatorPage />;
}
