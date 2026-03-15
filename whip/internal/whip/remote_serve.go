package whip

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	agentirc "github.com/bang9/ai-tools/shared/agentirc"
)

const deviceChallengeLogPrefix = "Device challenge OTP:"
const deviceChallengeResultLogPrefix = "Device challenge result:"

type RemoteHandle struct {
	cancel context.CancelFunc
	server *runningServer
	tunnel *TunnelManager
	done   chan struct{}

	finishOnce sync.Once
	stopOnce   sync.Once
	tunnelOnce sync.Once

	mu  sync.Mutex
	err error

	tunnelErr error
}

func (h *RemoteHandle) finish(err error) {
	h.finishOnce.Do(func() {
		h.mu.Lock()
		h.err = err
		h.mu.Unlock()
		close(h.done)
	})
}

func (h *RemoteHandle) Err() error {
	if h == nil {
		return nil
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.err
}

func (h *RemoteHandle) Exited() (bool, error) {
	if h == nil {
		return true, nil
	}
	select {
	case <-h.done:
		return true, h.Err()
	default:
		return false, nil
	}
}

func (h *RemoteHandle) Stop(timeout time.Duration) error {
	if h == nil {
		return nil
	}
	if exited, err := h.Exited(); exited {
		return err
	}
	h.stopOnce.Do(func() {
		h.cancel()
		h.finish(h.shutdown(timeout))
	})
	<-h.done
	return h.Err()
}

func (h *RemoteHandle) shutdown(timeout time.Duration) error {
	var err error
	if h.server != nil {
		err = errors.Join(err, h.server.Stop(timeout))
	}
	err = errors.Join(err, h.stopTunnel())
	return err
}

func (h *RemoteHandle) stopTunnel() error {
	if h == nil {
		return nil
	}
	h.tunnelOnce.Do(func() {
		if h.tunnel != nil {
			h.tunnelErr = h.tunnel.Stop()
		}
	})
	return h.tunnelErr
}

func StartServe(ctx context.Context, cfg RemoteConfig, token string, _ bool, onServeNotice func(string)) (*RemoteHandle, ServeResult, error) {
	authMode := NormalizeRemoteAuthMode(cfg.AuthMode)

	ircStore, err := agentirc.NewStore()
	if err != nil {
		return nil, ServeResult{}, fmt.Errorf("agent irc store: %w", err)
	}

	runCtx, cancel := context.WithCancel(ctx)

	var publicURL string
	var tunnelMgr *TunnelManager
	if cfg.Tunnel != "" {
		tunnelMgr = NewTunnelManager(cfg.Tunnel, cfg.Port)
		publicURL, err = tunnelMgr.Start(runCtx)
		if err != nil {
			cancel()
			return nil, ServeResult{}, fmt.Errorf("tunnel: %w", err)
		}
	}

	server, err := startRunningServer(ServerConfig{
		Port:       cfg.Port,
		BindHost:   cfg.BindHost,
		IRCStore:   ircStore,
		MasterTmux: WorkspaceMasterSessionName(cfg.Workspace),
		Token:      token,
		AuthMode:   authMode,
		Workspace:  cfg.Workspace,
		OnDeviceChallenge: func(info DeviceAuthChallengeInfo) {
			if onServeNotice != nil {
				onServeNotice(formatDeviceChallengeLogLine(info))
			}
		},
		OnDeviceChallengeResult: func(info DeviceAuthChallengeResultInfo) {
			if onServeNotice != nil {
				onServeNotice(formatDeviceChallengeResultLogLine(info))
			}
		},
		testHandlerWrapper: cfg.testHandlerWrapper,
	})
	if err != nil {
		cancel()
		if tunnelMgr != nil {
			_ = tunnelMgr.Stop()
		}
		return nil, ServeResult{}, err
	}

	handle := &RemoteHandle{
		cancel: cancel,
		server: server,
		tunnel: tunnelMgr,
		done:   make(chan struct{}),
	}

	go func() {
		err := server.Wait()
		handle.cancel()
		err = errors.Join(err, handle.stopTunnel())
		handle.finish(err)
	}()

	if done := ctx.Done(); done != nil {
		go func() {
			<-done
			_ = handle.Stop(defaultRemoteServerShutdownTimeout)
		}()
	}

	connectURL, shortURL, _ := serveURLs(server.info, publicURL)
	return handle, ServeResult{
		ConnectURL: connectURL,
		ShortURL:   shortURL,
	}, nil
}

func serveURLs(info ServerInfo, publicURL string) (connectURL string, shortURL string, webURL string) {
	baseURL := info.LocalURL
	if publicURL != "" {
		baseURL = publicURL
	}
	if info.AuthMode == RemoteAuthModeDevice {
		connectURL = DeviceConnectURL(baseURL)
	} else {
		connectURL = ConnectURL(baseURL, info.Token)
	}
	shortURL = fmt.Sprintf("%s/s/%s", strings.TrimRight(baseURL, "/"), info.ShortCode)
	webURL = DashboardURL(connectURL)
	return connectURL, shortURL, webURL
}

func formatDeviceChallengeLogLine(info DeviceAuthChallengeInfo) string {
	parts := []string{info.OTP}
	if ttl := formatChallengeTTL(info.CreatedAt, info.ExpiresAt); ttl != "" {
		parts = append(parts, ttl)
	}
	return fmt.Sprintf("%s %s", deviceChallengeLogPrefix, strings.Join(parts, "  "))
}

func formatDeviceChallengeResultLogLine(info DeviceAuthChallengeResultInfo) string {
	status := info.Result
	if status == "error" && info.Error != "" {
		status = fmt.Sprintf("failed (%s)", info.Error)
	} else if status == "error" {
		status = "failed"
	}
	return fmt.Sprintf("%s %s", deviceChallengeResultLogPrefix, status)
}

func formatChallengeTTL(createdAt, expiresAt time.Time) string {
	if createdAt.IsZero() || expiresAt.IsZero() {
		return ""
	}
	remaining := expiresAt.Sub(createdAt)
	if remaining <= 0 {
		return ""
	}
	totalSeconds := int(remaining / time.Second)
	if totalSeconds%60 == 0 {
		return fmt.Sprintf("expires in %dm", totalSeconds/60)
	}
	return fmt.Sprintf("expires in %ds", totalSeconds)
}
