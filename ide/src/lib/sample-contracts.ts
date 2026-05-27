export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  content?: string;
  language?: string;
}

export const sampleContracts: FileNode[] = [
  {
    name: "hello_world",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, vec, Env, Symbol, Vec};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    /// Say hello to someone.
    pub fn hello(env: Env, to: Symbol) -> Vec<Symbol> {
        env.events().publish((symbol_short!("greeting"),), to.clone());
        vec![&env, symbol_short!("Hello"), to]
    }

    /// Example with potentially unsafe math operations
    pub fn unsafe_math(env: Env, a: u64, b: u64) -> u64 {
        // These operations could overflow on ledger
        let sum = a + b;  // MATH001: Potentially unsafe addition
        let product = a * b;  // MATH001: Potentially unsafe multiplication
        let difference = a - b;  // MATH001: Potentially unsafe subtraction

        // Large number operations
        let big_amount: u128 = 1000000;
        let result = big_amount * a;  // MATH001: Potentially unsafe multiplication

        sum + product
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{symbol_short, vec, Env};

#[test]
fn test_hello() {
    let env = Env::default();
    let contract_id = env.register_contract(None, HelloContract);
    let client = HelloContractClient::new(&env, &contract_id);

    let words = client.hello(&symbol_short!("Dev"));
    assert_eq!(
        words,
        vec![&env, symbol_short!("Hello"), symbol_short!("Dev")]
    );

    use soroban_sdk::testutils::Events as _;
    let events = env.events().all();
    assert!(events.iter().any(|(_, topics, _)| {
        topics.contains(symbol_short!("greeting").into())
    }));
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "hello-world"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "token",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String,
};

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap()
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap()
    }

    pub fn balance(env: Env, address: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(address))
            .unwrap_or(0i128)
    }

    pub fn mint(env: Env, admin: Address, to: Address, amount: i128) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not admin");
        }
        let balance_key = DataKey::Balance(to.clone());
        let current_balance: i128 = env.storage().instance().get(&balance_key).unwrap_or(0i128);
        env.storage().instance().set(&balance_key, &(current_balance + amount));
    }

    pub fn set_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if admin != stored_admin {
            panic!("not admin");
        }
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_token_mint_and_set_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, TokenContract);
    let client = TokenContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let name = String::from_str(&env, "Test Token");
    let symbol = String::from_str(&env, "TST");

    client.initialize(&admin, &7, &name, &symbol);

    assert_eq!(client.decimals(), 7);

    // Mint tokens (admin required)
    client.mint(&admin, &alice, &1000);
    assert_eq!(client.balance(&alice), 1000);

    // Set admin (admin required)
    let new_admin = Address::generate(&env);
    client.set_admin(&admin, &new_admin);

    // Non-admin attempt should panic (bypass prevention verification)
    let res = std::panic::catch_unwind(|| {
        let env_inner = Env::default();
        env_inner.mock_all_auths();
        let c_id = env_inner.register_contract(None, TokenContract);
        let c_client = TokenContractClient::new(&env_inner, &c_id);
        let adm = Address::generate(&env_inner);
        let ali = Address::generate(&env_inner);
        let nm = String::from_str(&env_inner, "Test Token");
        let sym = String::from_str(&env_inner, "TST");
        c_client.initialize(&adm, &7, &nm, &sym);
        // Try to mint with non-admin (ali)
        c_client.mint(&ali, &ali, &100);
    });
    assert!(res.is_err());
  }`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "token-sample"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "increment",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, log, Env};

#[contracttype]
pub enum DataKey {
    Counter,
}

#[contract]
pub struct IncrementContract;

#[contractimpl]
impl IncrementContract {
    /// Increment an internal counter and return the value.
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0);

        count += 1;

        log!(&env, "count: {}", count);

        env.storage()
            .instance()
            .set(&DataKey::Counter, &count);

        env.storage().instance().extend_ttl(100, 100);

        count
    }

    /// Return the current value of the counter.
    pub fn get_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Counter)
            .unwrap_or(0)
    }
}`,
      },
    ],
  },
  {
    name: "cross_contract",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct CalleeContract;

#[contractimpl]
impl CalleeContract {
    pub fn add(env: Env, a: u32, b: u32) -> u32 {
        a + b
    }
}

#[contract]
pub struct CallerContract;

#[contractimpl]
impl CallerContract {
    pub fn call_add(env: Env, callee_id: Address, a: u32, b: u32) -> u32 {
        let client = CalleeContractClient::new(&env, &callee_id);
        client.add(&a, &b)
    }
}

mod test;`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::Env;

#[test]
fn test_cross_contract_call() {
    let env = Env::default();
    
    let callee_id = env.register_contract(None, CalleeContract);
    let caller_id = env.register_contract(None, CallerContract);
    let caller_client = CallerContractClient::new(&env, &caller_id);
    
    let result = caller_client.call_add(&callee_id, &5, &7);
    assert_eq!(result, 12);
}`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "cross-contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }`,
      },
    ],
  },
  {
    name: "assets",
    type: "folder",
    children: [
      {
        name: "logo.svg",
        type: "file",
        content: `<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <circle cx="50" cy="50" r="40" stroke="white" stroke-width="3" fill="none" />
  <path d="M30 50 L50 30 L70 50 L50 70 Z" fill="white" />
</svg>`,
      },
      {
        name: "banner.png",
        type: "file",
        content: "base64_encoded_placeholder_data",
      },
      {
        name: "icon.webp",
        type: "file",
        content: "base64_encoded_placeholder_data",
      },
    ],
  },
  // ── Liquidity Pool AMM ────────────────────────────────────────────────────
  {
    name: "liquidity_pool_amm",
    type: "folder",
    children: [
      {
        name: "lib.rs",
        type: "file",
        language: "rust",
        content: `#![no_std]

//! Liquidity Pool AMM — Constant-Product Market Maker (x * y = k)
//!
//! Implements the classic automated market maker formula used by protocols
//! like Uniswap v2.  Two token reserves are maintained; swaps move along the
//! constant-product curve while liquidity providers (LPs) mint/burn pool
//! shares proportional to their deposit.
//!
//! Key invariant:  reserve_a * reserve_b = k  (before fees)
//! Swap fee:       0.3 % retained in the pool, accruing to LPs

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token, Address, Env, Symbol,
};

// ─── Storage keys ──────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    ReserveA,
    ReserveB,
    TotalShares,
    TokenA,
    TokenB,
    LpShare(Address),
}

// ─── Fee constant ──────────────────────────────────────────────────────────

/// 0.3 % expressed as basis points in fixed-point arithmetic.
/// fee_numerator / FEE_DENOMINATOR = 997 / 1000 = 99.7 % of input forwarded.
const FEE_NUMERATOR: i128 = 997;
const FEE_DENOMINATOR: i128 = 1000;

// ─── Contract ──────────────────────────────────────────────────────────────

#[contract]
pub struct LiquidityPoolAMM;

#[contractimpl]
impl LiquidityPoolAMM {
    // ── Initialisation ─────────────────────────────────────────────────────

    /// Initialise the pool with the two token contract addresses.
    /// Must be called once before any deposits or swaps.
    pub fn initialize(env: Env, token_a: Address, token_b: Address) {
        assert!(
            env.storage().instance().get::<_, Address>(&DataKey::TokenA).is_none(),
            "already initialised"
        );
        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage().instance().set(&DataKey::ReserveA, &0_i128);
        env.storage().instance().set(&DataKey::ReserveB, &0_i128);
        env.storage().instance().set(&DataKey::TotalShares, &0_i128);
    }

    // ── Deposit / Add Liquidity ────────────────────────────────────────────

    /// Deposit \`amount_a\` of token A and \`amount_b\` of token B.
    ///
    /// The amounts must preserve the current pool ratio (or the pool is empty).
    /// LP shares are minted to \`provider\` proportional to the contribution.
    ///
    /// Returns the number of LP shares minted.
    pub fn deposit(
        env: Env,
        provider: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        provider.require_auth();
        assert!(amount_a > 0 && amount_b > 0, "amounts must be positive");

        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();

        // Enforce pool ratio if there are existing reserves.
        if reserve_a > 0 || reserve_b > 0 {
            // a / b must equal reserve_a / reserve_b
            // → amount_a * reserve_b == amount_b * reserve_a
            assert!(
                amount_a * reserve_b == amount_b * reserve_a,
                "deposit ratio must match pool ratio"
            );
        }

        // Transfer tokens from the provider into the contract.
        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        token::Client::new(&env, &token_a_addr)
            .transfer(&provider, &env.current_contract_address(), &amount_a);
        token::Client::new(&env, &token_b_addr)
            .transfer(&provider, &env.current_contract_address(), &amount_b);

        // Mint shares using geometric-mean formula (Uniswap v2 style).
        let shares_minted = if total_shares == 0 {
            // First deposit: shares = sqrt(amount_a * amount_b)
            integer_sqrt(amount_a.checked_mul(amount_b).expect("overflow"))
        } else {
            // Subsequent deposits: proportional to existing supply.
            // shares = min(a/reserve_a, b/reserve_b) * total_shares
            let s_a = amount_a * total_shares / reserve_a;
            let s_b = amount_b * total_shares / reserve_b;
            s_a.min(s_b)
        };

        assert!(shares_minted > 0, "zero shares minted");

        // Persist updated state.
        env.storage().instance().set(&DataKey::ReserveA, &(reserve_a + amount_a));
        env.storage().instance().set(&DataKey::ReserveB, &(reserve_b + amount_b));
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares + shares_minted));

        let prev_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LpShare(provider.clone()))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::LpShare(provider.clone()), &(prev_shares + shares_minted));

        env.events().publish(
            (Symbol::new(&env, "deposit"),),
            (provider, amount_a, amount_b, shares_minted),
        );

        shares_minted
    }

    // ── Withdraw / Remove Liquidity ────────────────────────────────────────

    /// Burn \`shares\` LP tokens and receive the proportional pool assets.
    ///
    /// Returns (amount_a, amount_b) sent back to the provider.
    pub fn withdraw(env: Env, provider: Address, shares: i128) -> (i128, i128) {
        provider.require_auth();
        assert!(shares > 0, "shares must be positive");

        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap();
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap();
        let total_shares: i128 = env.storage().instance().get(&DataKey::TotalShares).unwrap();
        let provider_shares: i128 = env
            .storage()
            .instance()
            .get(&DataKey::LpShare(provider.clone()))
            .unwrap_or(0);

        assert!(provider_shares >= shares, "insufficient LP shares");
        assert!(total_shares > 0, "pool is empty");

        // Proportional redemption.
        let amount_a = shares * reserve_a / total_shares;
        let amount_b = shares * reserve_b / total_shares;
        assert!(amount_a > 0 && amount_b > 0, "zero-amount withdrawal");

        // Burn shares.
        env.storage().instance().set(
            &DataKey::LpShare(provider.clone()),
            &(provider_shares - shares),
        );
        env.storage().instance().set(&DataKey::TotalShares, &(total_shares - shares));
        env.storage().instance().set(&DataKey::ReserveA, &(reserve_a - amount_a));
        env.storage().instance().set(&DataKey::ReserveB, &(reserve_b - amount_b));

        // Send tokens back.
        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        token::Client::new(&env, &token_a_addr)
            .transfer(&env.current_contract_address(), &provider, &amount_a);
        token::Client::new(&env, &token_b_addr)
            .transfer(&env.current_contract_address(), &provider, &amount_b);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (provider, shares, amount_a, amount_b),
        );

        (amount_a, amount_b)
    }

    // ── Swap ───────────────────────────────────────────────────────────────

    /// Swap an exact \`amount_in\` of \`token_in\` for as many of the other token
    /// as the constant-product formula allows, subject to a 0.3 % fee.
    ///
    /// \`min_amount_out\` guards against excessive slippage (set to 1 to disable).
    ///
    /// Returns the amount of the output token transferred to \`recipient\`.
    pub fn swap(
        env: Env,
        caller: Address,
        token_in: Address,
        amount_in: i128,
        min_amount_out: i128,
        recipient: Address,
    ) -> i128 {
        caller.require_auth();
        assert!(amount_in > 0, "amount_in must be positive");
        assert!(min_amount_out >= 0, "min_amount_out must be non-negative");

        let token_a_addr: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b_addr: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();

        let (reserve_in_key, reserve_out_key, token_out_addr) =
            if token_in == token_a_addr {
                (DataKey::ReserveA, DataKey::ReserveB, token_b_addr.clone())
            } else if token_in == token_b_addr {
                (DataKey::ReserveB, DataKey::ReserveA, token_a_addr.clone())
            } else {
                panic!("token_in is not part of this pool");
            };

        let reserve_in: i128 = env.storage().instance().get(&reserve_in_key).unwrap();
        let reserve_out: i128 = env.storage().instance().get(&reserve_out_key).unwrap();
        assert!(reserve_in > 0 && reserve_out > 0, "pool has no liquidity");

        // Constant-product swap with fee:
        //   amount_out = (amount_in * fee_num * reserve_out)
        //              / (reserve_in * fee_den + amount_in * fee_num)
        let amount_in_with_fee = amount_in
            .checked_mul(FEE_NUMERATOR)
            .expect("overflow");
        let numerator = amount_in_with_fee
            .checked_mul(reserve_out)
            .expect("overflow");
        let denominator = reserve_in
            .checked_mul(FEE_DENOMINATOR)
            .expect("overflow")
            .checked_add(amount_in_with_fee)
            .expect("overflow");
        let amount_out = numerator / denominator;

        assert!(amount_out >= min_amount_out, "slippage too high");
        assert!(amount_out > 0, "zero output amount");

        // Transfer input tokens into the pool.
        token::Client::new(&env, &token_in)
            .transfer(&caller, &env.current_contract_address(), &amount_in);

        // Transfer output tokens to the recipient.
        token::Client::new(&env, &token_out_addr)
            .transfer(&env.current_contract_address(), &recipient, &amount_out);

        // Update reserves.
        env.storage()
            .instance()
            .set(&reserve_in_key, &(reserve_in + amount_in));
        env.storage()
            .instance()
            .set(&reserve_out_key, &(reserve_out - amount_out));

        env.events().publish(
            (Symbol::new(&env, "swap"),),
            (caller, token_in, amount_in, amount_out, recipient),
        );

        amount_out
    }

    // ── Read-only getters ──────────────────────────────────────────────────

    pub fn get_reserves(env: Env) -> (i128, i128) {
        let a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        (a, b)
    }

    pub fn get_total_shares(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalShares).unwrap_or(0)
    }

    pub fn get_lp_shares(env: Env, provider: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::LpShare(provider))
            .unwrap_or(0)
    }

    /// Quote: how many output tokens will \`amount_in\` of token A buy?
    pub fn quote_swap_a_to_b(env: Env, amount_in: i128) -> i128 {
        let reserve_a: i128 = env.storage().instance().get(&DataKey::ReserveA).unwrap_or(0);
        let reserve_b: i128 = env.storage().instance().get(&DataKey::ReserveB).unwrap_or(0);
        if reserve_a == 0 || reserve_b == 0 {
            return 0;
        }
        let num = amount_in * FEE_NUMERATOR * reserve_b;
        let den = reserve_a * FEE_DENOMINATOR + amount_in * FEE_NUMERATOR;
        num / den
    }
}

// ─── Math helpers ──────────────────────────────────────────────────────────

/// Integer square root via Newton–Raphson (floor).
fn integer_sqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

mod test;
`,
      },
      {
        name: "test.rs",
        type: "file",
        language: "rust",
        content: `#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token, Address, Env, IntoVal,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

fn create_token(env: &Env, admin: &Address) -> (Address, token::Client) {
    let addr = env.register_stellar_asset_contract(admin.clone());
    let client = token::Client::new(env, &addr);
    (addr, client)
}

fn setup() -> (Env, Address, Address, Address, LiquidityPoolAMMClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (token_a_addr, token_a) = create_token(&env, &admin);
    let (token_b_addr, token_b) = create_token(&env, &admin);

    let pool_id = env.register_contract(None, LiquidityPoolAMM);
    let pool = LiquidityPoolAMMClient::new(&env, &pool_id);

    pool.initialize(&token_a_addr, &token_b_addr);

    (env, token_a_addr, token_b_addr, pool_id, pool)
}

// ─── Deposit tests ────────────────────────────────────────────────────────

#[test]
fn test_first_deposit_mints_shares() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let provider = Address::generate(&env);

    // Fund provider.
    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&provider, &1_000_000);
    tb.mint(&provider, &1_000_000);

    // Deposit 100 A + 400 B  →  sqrt(100 * 400) = 200 shares.
    let shares = pool.deposit(&provider, &100_i128, &400_i128);
    assert_eq!(shares, 200, "first deposit should mint geometric-mean shares");
    assert_eq!(pool.get_total_shares(), 200);

    let (ra, rb) = pool.get_reserves();
    assert_eq!(ra, 100);
    assert_eq!(rb, 400);
}

#[test]
fn test_subsequent_deposit_proportional() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&p1, &1_000_000);
    tb.mint(&p1, &1_000_000);
    ta.mint(&p2, &1_000_000);
    tb.mint(&p2, &1_000_000);

    // First deposit: 100 A + 100 B → 100 shares.
    pool.deposit(&p1, &100_i128, &100_i128);
    // Second deposit: same ratio → proportional shares.
    let shares2 = pool.deposit(&p2, &50_i128, &50_i128);
    assert_eq!(shares2, 50);
    assert_eq!(pool.get_total_shares(), 150);
}

// ─── Swap tests ───────────────────────────────────────────────────────────

#[test]
fn test_swap_constant_product() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    // Seed pool: 10 000 A + 10 000 B.
    pool.deposit(&lp, &10_000_i128, &10_000_i128);

    // Swap 1 000 A → B.
    // Expected out ≈ (1000 * 997 * 10000) / (10000 * 1000 + 1000 * 997)
    //              = 9_970_000 / 10_997_000 * 10000 ≈ 906
    let token_b_client = token::Client::new(&env, &token_b_addr);
    let before = token_b_client.balance(&trader);
    let out = pool.swap(&trader, &token_a_addr, &1_000_i128, &1_i128, &trader);
    let after = token_b_client.balance(&trader);

    assert_eq!(after - before, out);
    assert!(out > 900 && out < 1000, "output should respect 0.3% fee");

    // k should be non-decreasing (fees stay in pool).
    let (ra, rb) = pool.get_reserves();
    assert!(ra * rb >= 10_000 * 10_000, "invariant k must not decrease");
}

#[test]
fn test_swap_slippage_guard() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    pool.deposit(&lp, &1_000_i128, &1_000_i128);

    // Demand an unrealistically large output → should panic with slippage error.
    let result = std::panic::catch_unwind(|| {
        pool.swap(&trader, &token_a_addr, &100_i128, &999_i128, &trader)
    });
    assert!(result.is_err(), "should panic on slippage violation");
}

// ─── Withdraw tests ───────────────────────────────────────────────────────

#[test]
fn test_withdraw_returns_proportional_assets() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let provider = Address::generate(&env);

    let ta_client = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb_client = token::StellarAssetClient::new(&env, &token_b_addr);
    ta_client.mint(&provider, &1_000_000);
    tb_client.mint(&provider, &1_000_000);

    let shares = pool.deposit(&provider, &1_000_i128, &2_000_i128);

    let ta = token::Client::new(&env, &token_a_addr);
    let tb = token::Client::new(&env, &token_b_addr);
    let a_before = ta.balance(&provider);
    let b_before = tb.balance(&provider);

    // Withdraw half of shares.
    let (ret_a, ret_b) = pool.withdraw(&provider, &(shares / 2));

    assert_eq!(ret_a, 500);
    assert_eq!(ret_b, 1000);
    assert_eq!(ta.balance(&provider) - a_before, 500);
    assert_eq!(tb.balance(&provider) - b_before, 1000);
}

// ─── Quote tests ──────────────────────────────────────────────────────────

#[test]
fn test_quote_is_consistent_with_swap() {
    let (env, token_a_addr, token_b_addr, pool_id, pool) = setup();
    let lp = Address::generate(&env);
    let trader = Address::generate(&env);

    let ta = token::StellarAssetClient::new(&env, &token_a_addr);
    let tb = token::StellarAssetClient::new(&env, &token_b_addr);
    ta.mint(&lp, &1_000_000);
    tb.mint(&lp, &1_000_000);
    ta.mint(&trader, &100_000);

    pool.deposit(&lp, &10_000_i128, &10_000_i128);

    let quoted = pool.quote_swap_a_to_b(&500_i128);
    let actual = pool.swap(&trader, &token_a_addr, &500_i128, &1_i128, &trader);

    assert_eq!(quoted, actual, "quote must match actual swap output");
}
`,
      },
      {
        name: "Cargo.toml",
        type: "file",
        language: "toml",
        content: `[package]
name = "liquidity-pool-amm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = { workspace = true }

[dev-dependencies]
soroban-sdk = { workspace = true, features = ["testutils"] }
`,
      },
    ],
  },
];

export function findFile(nodes: FileNode[], path: string[]): FileNode | null {
  for (const node of nodes) {
    if (node.name === path[0]) {
      if (path.length === 1) return node;
      if (node.children) return findFile(node.children, path.slice(1));
    }
  }
  return null;
}
