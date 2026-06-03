"use client";
import { useEffect, useState, useRef } from "react";
import { BrowserProvider, Contract, formatEther, parseEther, JsonRpcProvider } from "ethers";

const VULN_ADDRESS = process.env.NEXT_PUBLIC_VULN_ADDRESS!;
const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS!;
const ATTACKER_VULN = process.env.NEXT_PUBLIC_ATTACKER_VULN!;
const ATTACKER_SAFE = process.env.NEXT_PUBLIC_ATTACKER_SAFE!;
const RPC = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

const VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw() external",
  "function balances(address) view returns (uint256)",
  "function vaultBalance() view returns (uint256)"
];

const ATTACKER_ABI = [
  "function attack() external payable",
  "function loot() view returns (uint256)"
];

const ALICE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB   = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const EVE   = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

function identicon(addr: string): string {
  const c = parseInt(addr.slice(2, 8), 16);
  const hue = c % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function short(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

function playSound(type: "deposit" | "attack" | "defense") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "deposit") {
      osc.frequency.value = 800;
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === "attack") {
      osc.frequency.value = 220;
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } else if (type === "defense") {
      osc.frequency.value = 600;
      osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {}
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (Math.abs(diff) < 0.001) return;
    const duration = Math.abs(diff) > 5 ? 1000 : 400;
    const startTime = performance.now();
    let raf: number;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + diff * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display.toFixed(3)}</>;
}

type Tx = { hash: string; type: string; from: string; status: string; ts: number; detail?: string };

export default function Home() {
  const [account, setAccount] = useState<string>("");
  const [mode, setMode] = useState<"vulnerable" | "safe">("vulnerable");
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [userBalances, setUserBalances] = useState<{[k: string]: number}>({});
  const [attackerLoot, setAttackerLoot] = useState<{[k: string]: number}>({});
  const [blockNum, setBlockNum] = useState<number>(0);
  const [gasPrice, setGasPrice] = useState<string>("0");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [alert, setAlert] = useState<{msg: string, type: string} | null>(null);
  const [attacking, setAttacking] = useState(false);

  const vaultAddr = mode === "vulnerable" ? VULN_ADDRESS : SAFE_ADDRESS;
  const attackerAddr = mode === "vulnerable" ? ATTACKER_VULN : ATTACKER_SAFE;
  const reader = useRef<JsonRpcProvider | null>(null);

  useEffect(() => {
    reader.current = new JsonRpcProvider(RPC);
  }, []);

  function addTx(tx: Omit<Tx, "ts">) {
    setTxs(prev => [{...tx, ts: Date.now()}, ...prev].slice(0, 50));
  }

  async function refreshChainStats() {
    if (!reader.current) return;
    try {
      const bn = await reader.current.getBlockNumber();
      setBlockNum(bn);
      const fd = await reader.current.getFeeData();
      setGasPrice(fd.gasPrice ? formatEther(fd.gasPrice * 21000n).slice(0, 8) : "0");
    } catch (e) {}
  }

  async function refreshBalances() {
    if (!reader.current) return;
    try {
      const vault = new Contract(vaultAddr, VAULT_ABI, reader.current);
      const vb = await vault.vaultBalance();
      setVaultBalance(parseFloat(formatEther(vb)));

      const [aliceB, bobB, eveB] = await Promise.all([
        vault.balances(ALICE),
        vault.balances(BOB),
        vault.balances(EVE),
      ]);
      setUserBalances({
        [ALICE]: parseFloat(formatEther(aliceB)),
        [BOB]: parseFloat(formatEther(bobB)),
        [EVE]: parseFloat(formatEther(eveB)),
      });

      const att = new Contract(attackerAddr, ATTACKER_ABI, reader.current);
      const loot = await att.loot();
      setAttackerLoot({[attackerAddr]: parseFloat(formatEther(loot))});
    } catch (e) {}
  }

  useEffect(() => {
    refreshChainStats();
    refreshBalances();
    const t1 = setInterval(refreshChainStats, 2000);
    const t2 = setInterval(refreshBalances, 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [mode, account]);

  async function connect() {
    if (!(window as any).ethereum) {
      setAlert({msg: "MetaMask not detected", type: "danger"});
      return;
    }
    const provider = new BrowserProvider((window as any).ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAccount(accounts[0]);
    addTx({hash: "connect", type: "CONNECT", from: accounts[0], status: "ok", detail: "Wallet connected"});
  }

  async function doDeposit(amount: string) {
    if (!(window as any).ethereum || !account) return;
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const vault = new Contract(vaultAddr, VAULT_ABI, signer);
    addTx({hash: "pending", type: `DEPOSIT ${amount} ETH`, from: account, status: "pending"});
    try {
      const tx = await vault.deposit({value: parseEther(amount)});
      addTx({hash: tx.hash, type: `DEPOSIT ${amount} ETH`, from: account, status: "sent"});
      await tx.wait();
      addTx({hash: tx.hash, type: `DEPOSIT ${amount} ETH`, from: account, status: "confirmed"});
      playSound("deposit");
    } catch (e: any) {
      addTx({hash: "err", type: `DEPOSIT ${amount} ETH`, from: account, status: "failed", detail: e.shortMessage || e.message});
    }
    refreshBalances();
  }

  async function doWithdraw() {
    if (!(window as any).ethereum || !account) return;
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const vault = new Contract(vaultAddr, VAULT_ABI, signer);
    addTx({hash: "pending", type: "WITHDRAW", from: account, status: "pending"});
    try {
      const tx = await vault.withdraw();
      addTx({hash: tx.hash, type: "WITHDRAW", from: account, status: "sent"});
      await tx.wait();
      addTx({hash: tx.hash, type: "WITHDRAW", from: account, status: "confirmed"});
      playSound("deposit");
    } catch (e: any) {
      addTx({hash: "err", type: "WITHDRAW", from: account, status: "reverted", detail: e.shortMessage || e.message});
      setAlert({msg: "Withdraw reverted — defense held!", type: "safe"});
      playSound("defense");
    }
    refreshBalances();
  }

  async function triggerAttack() {
    if (!(window as any).ethereum || !account) {
      setAlert({msg: "Connect wallet first (as Eve)", type: "danger"});
      return;
    }
    setAttacking(true);
    const provider = new BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const att = new Contract(attackerAddr, ATTACKER_ABI, signer);
    addTx({hash: "pending", type: `🚨 ATTACK on ${mode} vault`, from: account, status: "pending", detail: "1 ETH to attacker contract"});
    try {
      const tx = await att.attack({value: parseEther("1")});
      addTx({hash: tx.hash, type: `🚨 ATTACK`, from: account, status: "sent"});
      await tx.wait();
      addTx({hash: tx.hash, type: `🚨 ATTACK`, from: account, status: "confirmed", detail: "Vault drained!"});
      if (mode === "vulnerable") {
        playSound("attack");
        setAlert({msg: "🚨 VAULT DRAINED — Eve stole all customer funds via reentrancy", type: "danger"});
      }
    } catch (e: any) {
      addTx({hash: "err", type: `🚨 ATTACK`, from: account, status: "BLOCKED", detail: e.shortMessage || e.message});
      setAlert({msg: "🛡 Attack BLOCKED by nonReentrant guard + CEI ordering", type: "safe"});
      playSound("defense");
    }
    setAttacking(false);
    refreshBalances();
  }

  const ui = {
    bg: "#0F1B2D", panel: "#1A2A42", border: "#2D3142", text: "#E2E8F0", muted: "#64748B",
    cyan: "#22D3EE", red: "#EF4444", green: "#10B981", amber: "#F59E0B"
  };

  const userCard = (label: string, addr: string, color: string) => {
    const isYou = account.toLowerCase() === addr.toLowerCase();
    const onChainBal = userBalances[addr] ?? 0;
    return (
      <div style={{background: ui.panel, borderRadius: 12, padding: 18, border: `1px solid ${isYou ? ui.cyan : ui.border}`, position: "relative"}}>
        {isYou && (
          <div style={{position: "absolute", top: 8, right: 8, background: ui.cyan, color: "#000", fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700}}>YOU</div>
        )}
        <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 12}}>
          <div style={{width: 40, height: 40, borderRadius: "50%", background: identicon(addr), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 18}}>
            {label[0]}
          </div>
          <div>
            <div style={{fontSize: 16, fontWeight: 700, color: ui.text}}>{label}</div>
            <div style={{fontSize: 11, fontFamily: "monospace", color: ui.muted}}>{short(addr)}</div>
          </div>
        </div>
        <div style={{fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.5}}>Vault Balance</div>
        <div style={{fontSize: 24, fontWeight: 700, color: color, fontFamily: "Georgia, serif"}}>
          <AnimatedNumber value={onChainBal} /> ETH
        </div>
      </div>
    );
  };

  const drained = vaultBalance < 0.0001 && mode === "vulnerable" && (userBalances[ALICE] > 0 || userBalances[BOB] > 0);

  return (
    <div style={{minHeight: "100vh", background: ui.bg, color: ui.text, padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"}}>
      <div style={{maxWidth: 1400, margin: "0 auto"}}>

        <header style={{display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `1px solid ${ui.border}`, marginBottom: 24}}>
          <div>
            <div style={{fontSize: 28, fontWeight: 700, color: ui.cyan}}>SafeVault <span style={{color: "#fff"}}>Bank</span></div>
            <div style={{color: ui.muted, fontSize: 13, marginTop: 4}}>Your decentralized savings, secured by code.</div>
          </div>
          <div style={{display: "flex", gap: 16, alignItems: "center"}}>
            <div style={{textAlign: "right"}}>
              <div style={{fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.5}}>Block</div>
              <div style={{fontFamily: "monospace", color: ui.green, fontSize: 14, fontWeight: 600}}>#{blockNum}</div>
            </div>
            <div style={{textAlign: "right"}}>
              <div style={{fontSize: 11, color: ui.muted, textTransform: "uppercase", letterSpacing: 1.5}}>Chain</div>
              <div style={{fontFamily: "monospace", color: ui.cyan, fontSize: 14, fontWeight: 600}}>31337</div>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 8}}>
              <span style={{width: 10, height: 10, borderRadius: "50%", background: ui.green, display: "inline-block", boxShadow: `0 0 12px ${ui.green}`}}></span>
              <span style={{color: ui.green, fontSize: 12, fontWeight: 600}}>LIVE</span>
            </div>
          </div>
        </header>

        <div style={{display: "flex", gap: 12, marginBottom: 20}}>
          <button onClick={() => setMode("vulnerable")} style={{padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, background: mode === "vulnerable" ? "#DC2626" : "#1E293B", color: mode === "vulnerable" ? "#fff" : ui.muted}}>
            ⚠️  Vulnerable Vault
          </button>
          <button onClick={() => setMode("safe")} style={{padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, background: mode === "safe" ? ui.green : "#1E293B", color: mode === "safe" ? "#fff" : ui.muted}}>
            🛡️  SafeVault (nonReentrant + CEI)
          </button>
          <div style={{flex: 1}}></div>
          <div style={{fontFamily: "monospace", color: ui.muted, fontSize: 11, alignSelf: "center"}}>
            Contract: {short(vaultAddr)}
          </div>
        </div>

        <div style={{display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20}}>

          {/* LEFT — vault + users + actions */}
          <div style={{display: "flex", flexDirection: "column", gap: 16}}>

            {/* Big vault display */}
            <div style={{background: ui.panel, borderRadius: 12, padding: 24, border: `1px solid ${ui.border}`, position: "relative", overflow: "hidden"}}>
              {drained && (
                <div style={{position: "absolute", inset: 0, background: "radial-gradient(circle, rgba(239,68,68,0.15), transparent)", animation: "pulse 2s infinite"}}></div>
              )}
              <div style={{color: ui.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8}}>Total Vault Balance</div>
              <div style={{fontSize: 64, fontWeight: 700, color: drained ? ui.red : "#fff", fontFamily: "Georgia, serif", lineHeight: 1, position: "relative"}}>
                <AnimatedNumber value={vaultBalance} /> <span style={{fontSize: 36, opacity: 0.6}}>ETH</span>
              </div>

              {alert && (
                <div style={{marginTop: 18, padding: 14, borderRadius: 8, borderLeft: "4px solid", borderLeftColor: alert.type === "safe" ? ui.green : ui.red, background: alert.type === "safe" ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: alert.type === "safe" ? "#6EE7B7" : "#FCA5A5", fontSize: 14, fontWeight: 600}}>
                  {alert.msg}
                </div>
              )}
            </div>

            {/* 3 user cards */}
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12}}>
              {userCard("Alice", ALICE, ui.cyan)}
              {userCard("Bob", BOB, ui.cyan)}
              {userCard("Eve 🦹", EVE, ui.amber)}
            </div>

            {/* Action panel */}
            <div style={{background: ui.panel, borderRadius: 12, padding: 20, border: `1px solid ${ui.border}`}}>
              {!account ? (
                <button onClick={connect} style={{padding: "12px 28px", background: ui.cyan, color: "#000", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15}}>
                  Connect MetaMask
                </button>
              ) : (
                <>
                  <div style={{fontSize: 13, marginBottom: 14, color: ui.muted}}>
                    Acting as: <span style={{fontFamily: "monospace", color: ui.cyan, fontWeight: 600}}>{short(account)}</span>
                    {account.toLowerCase() === ALICE.toLowerCase() && <span style={{marginLeft: 8, color: ui.text}}>· Alice</span>}
                    {account.toLowerCase() === BOB.toLowerCase() && <span style={{marginLeft: 8, color: ui.text}}>· Bob</span>}
                    {account.toLowerCase() === EVE.toLowerCase() && <span style={{marginLeft: 8, color: ui.amber, fontWeight: 700}}>· Eve 🦹</span>}
                  </div>
                  <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
                    <button onClick={() => doDeposit("5")} style={{padding: "10px 18px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600}}>Deposit 5 ETH</button>
                    <button onClick={() => doDeposit("1")} style={{padding: "10px 18px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600}}>Deposit 1 ETH</button>
                    <button onClick={doWithdraw} style={{padding: "10px 18px", background: ui.amber, color: "#000", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600}}>Withdraw</button>
                    <div style={{flex: 1}}></div>
                    <button onClick={triggerAttack} disabled={attacking} style={{padding: "10px 22px", background: attacking ? "#666" : ui.red, color: "#fff", border: "none", borderRadius: 6, cursor: attacking ? "wait" : "pointer", fontWeight: 700, fontSize: 14}}>
                      {attacking ? "Attacking..." : "🚨 Trigger Attack"}
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>

          {/* RIGHT — transaction feed */}
          <div style={{background: ui.panel, borderRadius: 12, padding: 20, border: `1px solid ${ui.border}`}}>
            <div style={{color: ui.cyan, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontWeight: 600}}>Live Transaction Feed</div>
            <div style={{height: 640, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8}}>
              {txs.length === 0 ? (
                <div style={{color: ui.muted, fontSize: 12, textAlign: "center", marginTop: 40}}>No transactions yet</div>
              ) : txs.map((tx, i) => {
                const color = tx.status === "confirmed" ? ui.green : tx.status === "BLOCKED" || tx.status === "reverted" ? ui.green : tx.status === "failed" ? ui.red : tx.status === "pending" ? ui.amber : ui.cyan;
                return (
                  <div key={i} style={{padding: 10, background: "rgba(0,0,0,0.25)", borderRadius: 6, borderLeft: `3px solid ${color}`, fontSize: 11}}>
                    <div style={{display: "flex", justifyContent: "space-between", marginBottom: 4}}>
                      <span style={{fontWeight: 700, color: ui.text}}>{tx.type}</span>
                      <span style={{color, fontWeight: 600, fontSize: 10, textTransform: "uppercase"}}>{tx.status}</span>
                    </div>
                    <div style={{fontFamily: "monospace", color: ui.muted, fontSize: 10}}>from {short(tx.from)}</div>
                    {tx.hash !== "pending" && tx.hash !== "err" && tx.hash !== "connect" && (
                      <div style={{fontFamily: "monospace", color: ui.cyan, fontSize: 10, marginTop: 2}}>tx {short(tx.hash)}</div>
                    )}
                    {tx.detail && <div style={{color: ui.muted, fontSize: 10, marginTop: 4, fontStyle: "italic"}}>{tx.detail}</div>}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <footer style={{textAlign: "center", color: ui.muted, fontSize: 11, marginTop: 28}}>
          SafeVault Bank · Demo · CSL6010 Assignment 1 — Group 6 · IIT Jodhpur
        </footer>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
