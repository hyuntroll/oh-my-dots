// Local state/service boundary for the shipped account menu. All visual
// components, menu geometry, icons, text IDs and interaction primitives below
// come from the immutable original renderer. No native account store is read.

export function LocalAuthNonceProvider({ React, initial, children, onRefresh, onError }) {
  if (typeof initial?.ExactAuthNonceContext !== 'function') throw Error('Expose the original AuthNonce context before mounting the local account menu.');
  const Context = initial.ExactAuthNonceContext();
  const [nonce, setNonce] = React.useState(0);
  const update = React.useCallback(() => {
    // The original callback invalidates native auth caches. Local mode remounts
    // only its own children and optionally refreshes its own local data.
    setNonce(value => value + 1);
    try { Promise.resolve(onRefresh?.()).catch(error => onError?.(error)); }
    catch (error) { onError?.(error); }
  }, [onRefresh, onError]);
  return React.createElement(Context.Provider, { value:update }, React.createElement(React.Fragment, { key:nonce }, children));
}

const noSubscription = () => () => {};
const hiddenPet = () => false;

export function createLocalAccountMenuItems({ React, shared, initial, itemsModule, identity = {}, navigate,
  accountIcon, onOpenProfile, onLogout, pet, diagnostics = {}, onError } = {}) {
  if (!React?.createElement || typeof itemsModule?.ExactAccountMenuLayout !== 'function') throw Error('Expose the original account menu layout before installing the local adapter.');
  if (!shared?.ok || !shared?.tkt) throw Error('Original menu item and message components are unavailable.');
  const jsx = React.createElement;
  const message = (id, defaultMessage) => jsx(shared.tkt, { id, defaultMessage });
  // This label states the execution mode. It does not represent a subscription.
  const modeLabel = String(identity.modeLabel || 'Local');
  const Avatar = itemsModule.ExactAccountAvatar || initial?.oon;
  const report = error => {
    (diagnostics.errors ??= []).push(String(error?.message ?? error));
    onError?.(error);
  };
  function UnavailablePetItem() {
    const item = itemsModule.ExactPetMenuItem({ isOverlayOpen:false });
    return React.cloneElement(item, { disabled:true, title:'이 로컬 화면에서는 펫 오버레이를 사용할 수 없습니다.' });
  }
  return function LocalAccountMenuItems({ onClose, hideUsage = false } = {}) {
    const displayName = String(identity.displayName || 'Local');
    const settingsShortcut = shared.nCt(initial.vTn, 'settings');
    const isOverlayOpen = React.useSyncExternalStore(pet?.subscribe || noSubscription, pet?.getSnapshot || hiddenPet, hiddenPet);
    const action = callback => (...args) => {
      onClose?.();
      try { Promise.resolve(callback?.(...args)).catch(report); } catch (error) { report(error); }
    };
    const openRoute = route => {
      if (typeof navigate !== 'function') throw Error('Local settings navigation is unavailable.');
      return navigate(route);
    };
    const usage = hideUsage ? null : jsx(shared.ok, {
      leftIconAsset:shared.PS,
      onClick:action(() => openRoute('/settings/usage')),
      children:message('codex.profileDropdown.usage', 'Usage')
    });
    // Original referral eligibility is a cloud capability. Keep the original
    // item visible but explicitly disabled instead of inventing an invitation.
    const invitation = jsx(shared.ok, {
      leftIconAsset:shared.Su, disabled:true,
      title:'Invitations are unavailable in local mode',
      children:message('codex.profileDropdown.inviteFriend', 'Invite a friend')
    });
    const icon = accountIcon ?? (Avatar ? jsx(Avatar, {
      alt:'', colorKey:identity.userId || 'local-user', name:displayName,
      size:'xs', src:null
    }) : undefined);
    diagnostics.lastIdentity = { displayName, mode:'local' };
    const layout = jsx(itemsModule.ExactAccountMenuLayout, {
      displayName, personalPlanLabel:modeLabel, accountIcon:icon, hasWorkspaceAccount:false,
      isOverlayOpen:Boolean(isOverlayOpen),
      onOpenProfile:typeof onOpenProfile === 'function' ? action(onOpenProfile) : undefined,
      onOpenSettings:action(() => openRoute('/settings/general-settings')),
      settingsShortcut,
      onLogOut:typeof onLogout === 'function' ? action(onLogout) : undefined,
      onTogglePet:typeof pet?.toggle === 'function' ? action(() => pet.toggle()) : undefined,
      // ha renders workspaceInviteItem before usage and additionalItems after
      // its pet row. Its own aa() already supplies the original Help flyout.
      usageItems:jsx(React.Fragment, {}, usage, !pet?.toggle && jsx(UnavailablePetItem, {})), additionalItems:invitation
    });
    return jsx(React.Fragment, {}, layout, typeof onLogout !== 'function' && jsx(shared.ok, {
      leftIconAsset:shared.S, disabled:true, title:'로컬 모드에서는 로그인 세션을 사용하지 않습니다.',
      children:message('codex.profileDropdown.logOut', 'Log out')
    }));
  };
}

export function installLocalAccountMenu(options) {
  const { itemsModule, initial, React, identity = {} } = options;
  if (typeof itemsModule?.ExactAdaptProfileDropdownItems !== 'function') throw Error('Expose the original profile dropdown binding setter before installing the local adapter.');
  const LocalItems = createLocalAccountMenuItems(options);
  const restoreItems = itemsModule.ExactAdaptProfileDropdownItems(() => LocalItems);
  // The shipped footer chooses a gear for non-ChatGPT authentication. Supply
  // local identity in its existing trigger slots, retaining the original
  // footer button, label wrappers, popover, width and event handlers.
  const restoreFooter = initial?.ExactAdaptProfileFooter?.(Original => function LocalProfileFooter(props) {
    const name = String(identity.displayName || 'Local');
    const Avatar = itemsModule.ExactAccountAvatar;
    const replaceLabel = node => typeof node === 'string' ? name
      : React.isValidElement(node) && node.props.children != null
        ? React.cloneElement(node, {}, React.Children.map(node.props.children, replaceLabel)) : node;
    const decorate = node => {
      if (!React.isValidElement(node)) return node;
      if (node.type === initial.S2 && node.props.triggerButton && Avatar) {
        const trigger = node.props.triggerButton;
        // NOc's trigger slots are [loading status, icon, label]. React omits
        // null children, so retain their original array positions here.
        const original = trigger.props.children;
        if (Array.isArray(original) && original.length === 3) {
          return React.cloneElement(node, { triggerButton: React.cloneElement(trigger, {}, [original[0],
            React.createElement(Avatar, { key:'local-avatar', alt:'', colorKey:identity.userId || 'local-user', name, size:props?.compact ? 'sm' : 'xs', src:null }),
            replaceLabel(original[2])]), sidebarFooter: { ...node.props.sidebarFooter, profileIdentity: { displayName:name, profileImageUrl:null, username:null, isProfileAvailable:true } } });
        }
        return node;
      }
      return node.props.children != null ? React.cloneElement(node, {}, React.Children.map(node.props.children, decorate)) : node;
    };
    return decorate(Original(props));
  });
  return () => { restoreFooter?.(); restoreItems(); };
}
