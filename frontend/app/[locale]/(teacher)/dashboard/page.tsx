// import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  return (
    <div>
      <h1>{"Welcome to your dashboard"}</h1>
      <button disabled>{"Create quest"}</button>
    </div>
  );
}
