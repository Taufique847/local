import { redirect } from 'next/navigation';

export default function CustomersRedirectPage() {
  redirect('/app/customers');
}
