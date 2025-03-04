import {
  Box,
  Chip,
  Fade,
  Tooltip,
  Typography,
  useTheme,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { Skeleton } from "@material-ui/lab";
import { RenNetwork } from "@renproject/interfaces";
import { GatewaySession } from "@renproject/ren-tx";
import React, {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHistory } from "react-router-dom";
import {
  ActionButton,
  ActionButtonWrapper,
  SmallActionButton,
} from "../../components/buttons/Buttons";
import { AssetDropdown } from "../../components/dropdowns/AssetDropdown";
import { BlockIcon } from "../../components/icons/RenIcons";
import {
  BigTopWrapper,
  BigWrapper,
  CenteringSpacedBox,
  Hide,
  MediumWrapper,
} from "../../components/layout/LayoutHelpers";
import { Link } from "../../components/links/Links";
import {
  SimplePagination,
  SimplestPagination,
} from "../../components/pagination/SimplePagination";
import { PulseIndicator } from "../../components/progress/ProgressHelpers";
import { TooltipWithIcon } from "../../components/tooltips/TooltipWithIcon";
import {
  TransactionsHeader,
  TransactionsPaginationWrapper,
} from "../../components/transactions/TransactionsGrid";
import { Debug } from "../../components/utils/Debug";
import { WalletConnectionProgress } from "../../components/wallet/WalletHelpers";
import { featureFlags } from "../../constants/featureFlags";
import { paths } from "../../pages/routes";
import {
  BridgeChain,
  BridgeCurrency,
  getChainConfig,
  supportedLockCurrencies,
  supportedMintDestinationChains,
  toMintedCurrency,
} from "../../utils/assetConfigs";
import { getFormattedDateTime, getFormattedHMS } from "../../utils/dates";
import { isFirstVowel } from "../../utils/strings";
import {
  CircledProgressWithContent,
  getDepositStatusIcon,
} from "../mint/components/MultipleDepositsHelpers";
import {
  useDepositPagination,
  useIntervalCountdown,
  useMintMachine,
} from "../mint/mintHooks";
import { $mint, setMintCurrency } from "../mint/mintSlice";
import {
  areAllDepositsCompleted,
  createMintTransaction,
  getDepositParams,
  getLockAndMintBasicParams,
  getRemainingGatewayTime,
} from "../mint/mintUtils";
import { $renNetwork } from "../network/networkSlice";
import { useSelectedChainWallet } from "../wallet/walletHooks";
import {
  $wallet,
  setChain,
  setWalletPickerOpened,
} from "../wallet/walletSlice";
import {
  ErrorChip,
  SuccessChip,
  TransactionHistoryDialog,
  WarningChip,
  WarningLabel,
} from "./components/TransactionHistoryHelpers";
import {
  $currentTxId,
  $txHistoryOpened,
  setTxHistoryOpened,
} from "./transactionsSlice";
import {
  createTxQueryString,
  DepositEntryStatus,
  DepositPhase,
  GatewayStatus,
} from "./transactionsUtils";

export const MintTransactionHistory: FunctionComponent = () => {
  const dispatch = useDispatch();
  const { chain } = useSelector($wallet);
  const { walletConnected, account } = useSelectedChainWallet();
  const { currency } = useSelector($mint);
  const network = useSelector($renNetwork);
  const opened = useSelector($txHistoryOpened);
  const activeTxId = useSelector($currentTxId);
  const [page, setPage] = useState(0);

  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(true);
    setTimeout(() => {
      setPending(false);
    }, 1000);
  }, [currency, chain, page]);

  const chainConfig = getChainConfig(chain);

  const handleCurrencyChange = useCallback(
    (event) => {
      setPage(0);
      dispatch(setMintCurrency(event.target.value));
    },
    [dispatch]
  );
  const handleChainChange = useCallback(
    (event) => {
      setPage(0);
      dispatch(setChain(event.target.value));
    },
    [dispatch]
  );

  const handleChangePage = useCallback((event: unknown, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleWalletPickerOpen = useCallback(() => {
    dispatch(setWalletPickerOpened(true));
  }, [dispatch]);

  const handleTxHistoryClose = useCallback(() => {
    dispatch(setTxHistoryOpened(false));
  }, [dispatch]);

  const rowsPerPage = 3;
  const startDay = rowsPerPage * page;
  return (
    <TransactionHistoryDialog
      open={opened}
      onEscapeKeyDown={handleTxHistoryClose}
      onBackdropClick={handleTxHistoryClose}
    >
      <TransactionsHeader title="Viewing mint history for">
        <AssetDropdown
          condensed
          available={supportedLockCurrencies}
          value={currency}
          onChange={handleCurrencyChange}
        />
        <Box mx={2}>to</Box>
        <AssetDropdown
          mode="chain"
          condensed
          available={supportedMintDestinationChains}
          value={chain}
          onChange={handleChainChange}
        />
      </TransactionsHeader>
      {!walletConnected && (
        <BigTopWrapper>
          {!walletConnected && (
            <>
              <MediumWrapper>
                <Typography variant="body1" align="center">
                  Please connect {isFirstVowel(chainConfig.full) ? "an" : "a"}{" "}
                  {chainConfig.full} compatible wallet to view transactions
                </Typography>
              </MediumWrapper>
              <BigWrapper>
                <MediumWrapper>
                  <CenteringSpacedBox>
                    <WalletConnectionProgress />
                  </CenteringSpacedBox>
                </MediumWrapper>
                <ActionButtonWrapper>
                  <ActionButton onClick={handleWalletPickerOpen}>
                    Connect Wallet
                  </ActionButton>
                </ActionButtonWrapper>
              </BigWrapper>
            </>
          )}
        </BigTopWrapper>
      )}
      {walletConnected && (
        <>
          {[0, 1, 2].map((offset) => (
            <GatewayEntryResolver
              key={startDay + offset}
              dayOffset={startDay + offset}
              currency={currency}
              chain={chain}
              account={account}
              network={network}
              activeTxId={activeTxId}
              pending={pending}
            />
          ))}
          <Debug it={{ activeTxId }} />
          <Hide when={!featureFlags.enableTxHistoryExploration}>
            <TransactionsPaginationWrapper>
              <SimplePagination
                count={rowsPerPage * 2}
                rowsPerPage={rowsPerPage}
                page={page}
                onChangePage={handleChangePage}
              />
            </TransactionsPaginationWrapper>
          </Hide>
        </>
      )}
    </TransactionHistoryDialog>
  );
};

type GatewayResolverProps = {
  dayOffset: number;
  currency: BridgeCurrency;
  chain: BridgeChain;
  account: string;
  network: RenNetwork;
  pending: boolean;
  activeTxId: string;
};

const GatewayEntryResolver: FunctionComponent<GatewayResolverProps> = ({
  dayOffset,
  currency,
  chain,
  network,
  account,
  pending,
  activeTxId,
}) => {
  const tx = useMemo(
    () =>
      createMintTransaction({
        currency: currency,
        destAddress: account,
        mintedCurrency: toMintedCurrency(currency),
        mintedCurrencyChain: chain,
        userAddress: account,
        network: network,
        dayOffset: dayOffset,
      }),
    [currency, account, chain, network, dayOffset]
  );

  const isActive = activeTxId === tx.id;
  if (isActive) {
    return <GatewayEntry tx={tx} isActive />;
  }
  if (pending) {
    return <GatewayEntry tx={tx} pending />;
  }
  return <GatewayEntryMachine tx={tx} />;
};

export type GatewayEntryProps = {
  tx: GatewaySession;
  pending?: boolean;
  isActive?: boolean;
  onContinue?: ((depositHash?: string) => void) | (() => void);
};

export const GatewayEntryMachine: FunctionComponent<GatewayEntryProps> = ({
  tx,
}) => {
  const [current, , service] = useMintMachine(tx);
  useEffect(
    () => () => {
      // console.log("stopping", tx.id);
      service.stop();
    },
    [service]
  );
  useEffect(() => {
    // console.log("starting", tx.id);
  }, []);
  // console.log("updating", tx.id);
  return <GatewayEntry tx={current.context.tx} />;
};

const standardPaddings = {
  paddingLeft: 40,
  paddingRight: 50,
};

const standardShadow = `0px 0px 4px rgba(0, 27, 58, 0.1)`;

export const useGatewayEntryStyles = makeStyles((theme) => ({
  root: {
    background: theme.palette.common.white,
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginTop: 8,
    boxShadow: standardShadow,
  },
  gateway: {
    ...standardPaddings,
    paddingTop: 8,
    paddingBottom: 8,
    display: "flex",
    justifyContent: "stretch",
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  gatewayInfo: {
    flexGrow: 2,
  },
  gatewayLabel: {},
  gatewayAddress: {
    paddingTop: 1,
  },
  gatewayLink: {
    marginLeft: 8,
  },
  gatewayCounter: {
    minWidth: 180,
    display: "flex",
    justifyContent: "flex-end",
  },
  multiple: {
    ...standardPaddings,
    height: 32,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  multipleLabel: {
    marginRight: 16,
  },
  multiplePagination: {},
  deposit: {
    paddingLeft: standardPaddings.paddingLeft,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 64,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
  details: {
    width: 360,
    display: "flex",
    alignItems: "center",
  },
  detailsTitleAndDate: {
    flexGrow: 2,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailsTitle: {
    fontSize: 14,
  },
  detailsDate: {
    fontSize: 12,
  },
  links: {},
  link: {
    fontSize: 12,
    display: "inline-block",
    marginRight: 16,
    "&:last-child": {
      marginRight: 0,
    },
  },
  statusAndActions: {
    display: "flex",
    flexGrow: 2,
  },
  status: {
    display: "flex",
    alignItems: "center",
  },
  indicator: {
    width: 40,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    flexGrow: 1,
    paddingRight: 10,
  },
}));

const GatewayEntry: FunctionComponent<GatewayEntryProps> = ({
  tx,
  isActive,
}) => {
  const theme = useTheme();
  const styles = useGatewayEntryStyles();
  const dispatch = useDispatch();
  const history = useHistory();

  const [resolving, setResolving] = useState(true);

  const {
    handleNext,
    handlePrev,
    currentIndex,
    currentHash,
    total,
  } = useDepositPagination(tx);

  const {
    lockChainConfig,
    lockCurrencyConfig,
    mintCurrencyConfig,
    mintChainConfig,
    depositsCount,
    gatewayStatus,
  } = getLockAndMintBasicParams(tx);

  const deposit = tx.transactions[currentHash];
  const depositTime = getFormattedDateTime(Number(deposit?.detectedAt));
  const {
    lockConfirmations,
    lockTargetConfirmations,
    lockTxLink,
    lockTxAmount,
    mintTxLink,
    depositStatus,
    depositPhase,
  } = getDepositParams(tx, deposit);
  const hasDeposits = depositsCount > 0;

  const StatusIcon = getDepositStatusIcon({
    depositStatus,
    depositPhase,
    mintChainConfig,
    lockChainConfig,
  });

  const handlePageChange = useCallback(
    (event: any, newPage: number) => {
      newPage > currentIndex ? handleNext() : handlePrev();
    },
    [currentIndex, handleNext, handlePrev]
  );

  const handleContinue = useCallback(() => {
    const qsTx = { ...tx, depositHash: currentHash };
    history.push({
      pathname: paths.MINT_TRANSACTION,
      search: "?" + createTxQueryString(qsTx),
      state: {
        txState: {
          reloadTx: true,
        },
      },
    });
    dispatch(setTxHistoryOpened(false));
  }, [dispatch, history, tx, currentHash]);

  const timeToGatewayExpiration = useIntervalCountdown(
    getRemainingGatewayTime(tx.expiryTime)
  );

  useEffect(() => {
    if (tx.gatewayAddress) {
      if (hasDeposits) {
        setResolving(false);
      } else {
        setTimeout(() => {
          setResolving(false);
        }, 5000);
      }
    }
  }, [tx.gatewayAddress, hasDeposits]);

  const allCompleted = areAllDepositsCompleted(tx);
  const completed = depositStatus === DepositEntryStatus.COMPLETED;
  const confirmationProps = completed
    ? {}
    : {
        confirmations: lockConfirmations,
        targetConfirmations: lockTargetConfirmations,
      };
  return (
    <>
      <div className={styles.root}>
        <div className={styles.gateway}>
          <div className={styles.gatewayInfo}>
            <div className={styles.gatewayAddress}>
              {tx.gatewayAddress ? (
                <GatewayAddress
                  address={tx.gatewayAddress}
                  status={gatewayStatus}
                  onClick={handleContinue}
                />
              ) : (
                <Skeleton width={270} />
              )}
            </div>
          </div>
          <div className={styles.gatewayCounter}>
            {(gatewayStatus === GatewayStatus.CURRENT ||
              (hasDeposits && !allCompleted)) && (
              <Fade in={true}>
                <GatewayStatusChip
                  status={gatewayStatus}
                  timeToGatewayExpiration={timeToGatewayExpiration}
                />
              </Fade>
            )}
          </div>
        </div>
        {depositsCount > 1 && (
          <div className={styles.multiple}>
            <WarningLabel className={styles.multipleLabel}>
              Multiple Transactions
            </WarningLabel>
            <SimplestPagination
              className={styles.multiplePagination}
              count={total}
              rowsPerPage={1}
              page={currentIndex}
              onChangePage={handlePageChange}
            />
          </div>
        )}
        <div className={styles.deposit}>
          <div className={styles.details}>
            <div className={styles.detailsTitleAndDate}>
              {hasDeposits && (
                <>
                  <Typography className={styles.detailsTitle} component="div">
                    Mint {lockTxAmount} {mintCurrencyConfig.short} on{" "}
                    {mintChainConfig.full}
                    <div className={styles.links}>
                      {Boolean(lockTxLink) && (
                        <Link
                          href={lockTxLink}
                          external
                          color="primary"
                          underline="hover"
                          className={styles.link}
                        >
                          {lockChainConfig.full} transaction
                        </Link>
                      )}
                      {Boolean(mintTxLink) && (
                        <Link
                          href={mintTxLink}
                          external
                          color="primary"
                          underline="hover"
                          className={styles.link}
                        >
                          {mintChainConfig.full} transaction
                        </Link>
                      )}
                    </div>
                  </Typography>
                  {Boolean(deposit) && Boolean(deposit?.detectedAt) && (
                    <Typography
                      color="textSecondary"
                      component="span"
                      variant="inherit"
                      className={styles.detailsDate}
                    >
                      <Tooltip
                        title={`${depositTime.date} ${depositTime.time} `}
                        placement="top"
                      >
                        <span>{depositTime.date}</span>
                      </Tooltip>
                    </Typography>
                  )}
                </>
              )}
              {!hasDeposits && (
                <>
                  {resolving ? (
                    <Skeleton width={200} />
                  ) : (
                    <Typography className={styles.detailsTitle}>
                      No deposits found...
                    </Typography>
                  )}
                </>
              )}
            </div>
          </div>
          <div className={styles.statusAndActions}>
            <div className={styles.actions}>
              {isActive && (
                <Typography color="primary" variant="caption">
                  Close window to view
                </Typography>
              )}
              {!isActive && hasDeposits && (
                <>
                  {depositStatus === DepositEntryStatus.ACTION_REQUIRED && (
                    <SmallActionButton onClick={handleContinue}>
                      Action required!
                    </SmallActionButton>
                  )}
                  {depositStatus === DepositEntryStatus.PENDING &&
                    lockConfirmations < lockTargetConfirmations && (
                      <Typography color="textPrimary" variant="caption">
                        {lockConfirmations}/{lockTargetConfirmations}{" "}
                        Confirmations
                      </Typography>
                    )}
                </>
              )}
            </div>
            <div className={styles.status}>
              {resolving && (
                <Skeleton variant="circle" width={42} height={42} />
              )}
              {!resolving && hasDeposits && (
                <CircledProgressWithContent
                  color={
                    completed
                      ? theme.customColors.blue
                      : lockCurrencyConfig.color
                  }
                  {...confirmationProps}
                  processing={depositPhase === DepositPhase.NONE}
                  size={34}
                >
                  <StatusIcon />
                </CircledProgressWithContent>
              )}
            </div>
            <div className={styles.indicator}>
              {hasDeposits &&
                depositStatus === DepositEntryStatus.ACTION_REQUIRED && (
                  <PulseIndicator pulsing size={12} />
                )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

type GatewayStatusChipProps = {
  status: GatewayStatus;
  timeToGatewayExpiration?: number;
};

export const GatewayStatusChip: FunctionComponent<GatewayStatusChipProps> = ({
  status,
  timeToGatewayExpiration = 0,
}) => {
  switch (status) {
    case GatewayStatus.CURRENT:
      return (
        <SuccessChip
          label={
            <span>
              Time remaining:{" "}
              <strong>
                {getFormattedHMS(timeToGatewayExpiration + 24 * 3600 * 1000)}
              </strong>
            </span>
          }
        />
      );
    case GatewayStatus.PREVIOUS:
      return (
        <WarningChip
          label={
            <span>
              Time remaining:{" "}
              <strong>
                {getFormattedHMS(timeToGatewayExpiration + 24 * 3600 * 1000)}
              </strong>
            </span>
          }
        />
      );
    case GatewayStatus.EXPIRING:
      return (
        <ErrorChip
          label={
            <span>
              Time remaining:{" "}
              <strong>
                {getFormattedHMS(timeToGatewayExpiration + 24 * 3600 * 1000)}
              </strong>
            </span>
          }
        />
      );
    case GatewayStatus.EXPIRED:
      return <Chip label="Gateway expired" />;
    default:
      return null;
  }
};

type GatewayLabelProps = {
  status: GatewayStatus;
  timeToGatewayExpiration?: number;
};
export const GatewayLabel: FunctionComponent<GatewayLabelProps> = ({
  status,
  timeToGatewayExpiration = 0,
}) => {
  switch (status) {
    case GatewayStatus.CURRENT:
      return (
        <Typography>
          Current Gateway{" "}
          <TooltipWithIcon title="To ensure funds stay secure, Gateway Addresses refresh every 24 hours. Make sure a Gateway Address has not expired before sending assets to it." />
        </Typography>
      );
    case GatewayStatus.PREVIOUS:
      return (
        <Typography>
          Previous Gateway{" "}
          <TooltipWithIcon
            title={
              <span>
                Transactions listed here have{" "}
                {getFormattedHMS(timeToGatewayExpiration)} hours left to be
                confirmed. Please speed up or cancel the transactions if they
                will not be confirmed before this time elapses.
              </span>
            }
          />
        </Typography>
      );
    case GatewayStatus.EXPIRING:
      return (
        <Typography>
          Expiring Gateway{" "}
          <TooltipWithIcon
            title={
              <span>
                You have{" "}
                {getFormattedHMS(timeToGatewayExpiration + 24 * 3600 * 1000)}{" "}
                hours left to mint any deposits listed here. After this period,
                your funds will be lost. Any transactions completed before the
                Gateway Address expires are safe and remain on the destination
                chain.
              </span>
            }
          />
        </Typography>
      );
    case GatewayStatus.EXPIRED:
      return (
        <Typography>
          Expired Gateway{" "}
          <TooltipWithIcon title={<span>This gateway has expired.</span>} />
        </Typography>
      );
    default:
      return null;
  }
};

type GatewayAddressProps = {
  status: GatewayStatus;
  address: string;
  onClick: () => void;
};

const useGatewayAddressStyles = makeStyles(() => ({
  icon: {
    marginBottom: -1,
  },
  disabled: {
    userSelect: "none",
  },
}));
export const GatewayAddress: FunctionComponent<GatewayAddressProps> = ({
  status,
  onClick,
  address,
}) => {
  const styles = useGatewayAddressStyles();
  if (status === GatewayStatus.CURRENT) {
    return (
      <Typography variant="caption">
        <Link color="primary" underline="hover" onClick={onClick}>
          {address}
        </Link>
      </Typography>
    );
  }
  return (
    <Typography
      className={styles.disabled}
      color="textSecondary"
      variant="caption"
    >
      <BlockIcon className={styles.icon} fontSize="inherit" /> {address}
    </Typography>
  );
};
