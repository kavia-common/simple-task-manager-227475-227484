import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders todo app title and add input", () => {
  render(<App />);

  expect(screen.getByText(/to-?do/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/add a task/i)).toBeInTheDocument();
});
