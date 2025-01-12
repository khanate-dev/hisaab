import type { Route } from "./+types/home.route";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "Hisaab" },
		{ name: "description", content: "Personal Finance Management System" },
	];
}

const Home = () => {
	return <div>Hisaab</div>;
};

export default Home;
