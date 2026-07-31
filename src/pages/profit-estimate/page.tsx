import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ProfitEstimate() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/calculator", { replace: true }); }, [navigate]);
  return null;
}