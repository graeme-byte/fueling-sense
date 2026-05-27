import { connection } from 'next/server';
import RunningFuelingPage from './RunningFuelingPage';

export default async function Page() {
  await connection();
  return <RunningFuelingPage />;
}
