import { JoinForm } from './JoinForm';
import { SimulatedNotice } from '@/components/SimulatedNotice';

export const metadata = { title: 'Open an account' };

export default function JoinPage() {
  return (
    <>
      <SimulatedNotice what="identity verification">
        This is a demonstration. Upload only the specimen documents this project generates. Never
        upload a real identity document.
      </SimulatedNotice>
      <JoinForm />
    </>
  );
}
